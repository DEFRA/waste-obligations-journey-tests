'use strict'

// PRN test-data control for the local stack. Talks to the sqledge container via `docker exec sqlcmd`.
// Accepting/rejecting a PRN mutates the seed (status, ObligationYear for December Waste, new history rows)
// and the seed SQL is not idempotent, so we snapshot once and restore between cells instead of re-seeding.

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { CONTAINERS } = require('../config')

const STATE_DIR = path.join(__dirname, '..', '..', '.state')
const SNAPSHOT_FILE = path.join(STATE_DIR, 'prn-snapshot.json')
const SEEDED_FILE = path.join(STATE_DIR, 'seeded.json')
const SEED_PREFIX = 'MYDW-'
const SEED_MARKER = 'mydw-seed'
const DB = 'EprPrnBackend'

// The password is expanded inside the container from its own env, so it never appears in argv or error output.
function sql(query) {
  try {
    return execFileSync(
      'docker',
      [
        'exec',
        '-e',
        `MYDW_Q=SET NOCOUNT ON; ${query}`,
        CONTAINERS.sql,
        'sh',
        '-c',
        `/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -d ${DB} -y 0 -b -Q "$MYDW_Q"`
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 16 * 1024 * 1024
      }
    )
  } catch (err) {
    throw new Error(
      `sqlcmd failed: ${(err.stderr || err.stdout || err.message || '').toString().trim()}`
    )
  }
}

// FOR JSON output comes back under a JSON_<guid> header and dashes, chunked over several lines; join it back up.
function sqlJson(query) {
  const raw = sql(`${query} FOR JSON PATH, INCLUDE_NULL_VALUES`)
    .split(/\r?\n/)
    .filter(
      (l) => !/^JSON_[0-9A-F-]+$/i.test(l.trim()) && !/^-+$/.test(l.trim())
    )
    .join('')
    .trim()
  return raw ? JSON.parse(raw) : []
}

function listPrns(orgExternalId) {
  const where = orgExternalId ? `WHERE OrganisationId = '${orgExternalId}'` : ''
  return sqlJson(`SELECT Id, PrnNumber, ExternalId, OrganisationId, PrnStatusId, ObligationYear, DecemberWaste, IsExport,
    TonnageValue, MaterialName, IssueDate, StatusUpdatedOn FROM Prn ${where} ORDER BY Id`)
}

function maxHistoryId() {
  const rows = sqlJson(
    'SELECT ISNULL(MAX(Id), 0) AS maxId FROM PrnStatusHistory'
  )
  return rows[0].maxId
}

function snapshot({ force = false } = {}) {
  if (fs.existsSync(SNAPSHOT_FILE) && !force) {
    return {
      created: false,
      file: SNAPSHOT_FILE,
      reason: 'snapshot already exists (pass --force to overwrite)'
    }
  }
  const data = {
    takenAt: new Date().toISOString(),
    maxHistoryId: maxHistoryId(),
    prns: listPrns()
  }
  fs.mkdirSync(STATE_DIR, { recursive: true })
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(data, null, 2))
  return {
    created: true,
    file: SNAPSHOT_FILE,
    prnCount: data.prns.length,
    maxHistoryId: data.maxHistoryId
  }
}

function sqlLiteral(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number' || typeof v === 'boolean') return String(Number(v))
  return `'${String(v).replace(/'/g, "''")}'`
}

function resetSql(p) {
  return `UPDATE Prn SET PrnStatusId=${sqlLiteral(p.PrnStatusId)}, ObligationYear=${sqlLiteral(p.ObligationYear)},
    StatusUpdatedOn=${sqlLiteral(p.StatusUpdatedOn)}, IssueDate=${sqlLiteral(p.IssueDate)} WHERE PrnNumber=${sqlLiteral(p.PrnNumber)};`
}

function readSeeded() {
  return fs.existsSync(SEEDED_FILE)
    ? JSON.parse(fs.readFileSync(SEEDED_FILE, 'utf8'))
    : { prns: [] }
}

// Restores every snapshotted PRN and every skill-seeded PRN to its baseline, and drops history rows written since
// the snapshot (keeping the status-4 rows that --seed wrote, which carry Comment='mydw-seed').
function restore() {
  if (!fs.existsSync(SNAPSHOT_FILE))
    throw new Error(
      `No snapshot at ${SNAPSHOT_FILE}. Run --snapshot on a freshly seeded stack first.`
    )
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'))
  const seeded = readSeeded().prns
  const updates = [...snap.prns, ...seeded].map(resetSql).join('\n')
  sql(
    `BEGIN TRAN; DELETE FROM PrnStatusHistory WHERE Id > ${snap.maxHistoryId} AND ISNULL(Comment, '') <> '${SEED_MARKER}';\n${updates}\nCOMMIT;`
  )
  const now = listPrns()
  return {
    restored: snap.prns.length,
    seededRestored: seeded.length,
    historyRowsAbove: snap.maxHistoryId,
    remainingDrift: [...diff(snap.prns, now), ...diff(seeded, now)]
  }
}

function diff(before, after) {
  const byNumber = new Map(after.map((p) => [p.PrnNumber, p]))
  const out = []
  for (const b of before) {
    const a = byNumber.get(b.PrnNumber)
    if (!a) {
      out.push({ PrnNumber: b.PrnNumber, change: 'missing' })
      continue
    }
    for (const k of [
      'PrnStatusId',
      'ObligationYear',
      'IssueDate',
      'StatusUpdatedOn'
    ]) {
      if (String(a[k]) !== String(b[k]))
        out.push({ PrnNumber: b.PrnNumber, field: k, from: b[k], to: a[k] })
    }
  }
  return out
}

function status() {
  if (!fs.existsSync(SNAPSHOT_FILE)) return { snapshot: null, drift: null }
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'))
  const seeded = readSeeded()
  const now = listPrns()
  return {
    snapshot: { takenAt: snap.takenAt, prns: snap.prns.length },
    seeded: seeded.prns.length
      ? {
          seededAt: seeded.seededAt,
          clock: seeded.clock,
          decemberYear: seeded.decemberYear,
          prns: seeded.prns.map((p) => p.PrnNumber)
        }
      : null,
    drift: [...diff(snap.prns, now), ...diff(seeded.prns, now)]
  }
}

// The blue "Can be accepted towards ..." tag needs a DW PRN issued 1 Dec..31 Jan of the current window.
// Seeded DW PRNs are issued in Mar/Apr, so move one into the window. restore() puts IssueDate back.
function setIssueDate(prnNumber, isoDate) {
  sql(
    `UPDATE Prn SET IssueDate=${sqlLiteral(isoDate)} WHERE PrnNumber=${sqlLiteral(prnNumber)};`
  )
  return listPrns().find((p) => p.PrnNumber === prnNumber)
}

// ---------------------------------------------------------------------------------------------------------------
// Skill-owned seed rows. epr-prn-common-backend is NOT time-shifted, so "issued in December" has to be written as
// an explicit IssueDate. The December used is derived from the frontend's (time-shifted) clock: the current
// December when the clock is in December, otherwise the most recent one (so in January it is last December).

const MATERIALS = new Set([
  'Aluminium',
  'Fibre',
  'Glass Re-melt',
  'Glass Other',
  'Paper/board',
  'Plastic',
  'Steel',
  'Wood'
])

function ukYearMonth(date) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: 'numeric'
  })
  const p = Object.fromEntries(
    f.formatToParts(date).map((x) => [x.type, Number(x.value)])
  )
  return { year: p.year, month: p.month }
}

function decemberYearFor(now) {
  const { year, month } = ukYearMonth(now)
  return month === 12 ? year : year - 1
}

function iso(d) {
  return d.toISOString().slice(0, 19)
}

// Definitions for one org. tag is DP (DRP) or CS. D = December year, C = compliance year.
function seedPlan({ tag, now, decemberYear, complianceYear }) {
  const D = decemberYear
  const recent = new Date(now.getTime() - 7 * 24 * 3600 * 1000)
  const rows = [
    {
      suffix: 'PRN-DW-DEC',
      note: 'PRN',
      dw: true,
      material: 'Paper/board',
      tonnage: 5,
      issue: `${D}-12-10T09:00:00`,
      ob: D,
      purpose: `December Waste PRN issued 10 Dec ${D} (in the flash window)`
    },
    {
      suffix: 'PERN-DW-DEC',
      note: 'PERN',
      dw: true,
      material: 'Plastic',
      tonnage: 7,
      issue: `${D}-12-12T09:00:00`,
      ob: D,
      purpose: `December Waste PERN issued 12 Dec ${D} (in the flash window)`
    },
    {
      suffix: 'PRN-DW-JAN',
      note: 'PRN',
      dw: true,
      material: 'Glass Re-melt',
      tonnage: 4,
      issue: `${D + 1}-01-15T09:00:00`,
      ob: D,
      purpose: `December Waste PRN issued 15 Jan ${D + 1} (late issue, still in the window)`
    },
    {
      suffix: 'PRN-DW-NOV',
      note: 'PRN',
      dw: true,
      material: 'Paper/board',
      tonnage: 2,
      issue: `${D}-11-28T09:00:00`,
      ob: D,
      purpose: `December Waste PRN issued 28 Nov ${D} (outside the flash window — no blue tag)`
    },
    {
      suffix: 'PERN-STD',
      note: 'PERN',
      dw: false,
      material: 'Aluminium',
      tonnage: 3,
      issue: iso(recent),
      ob: complianceYear,
      purpose: `Standard PERN for ${complianceYear} (single year, bulk-selectable)`
    },
    {
      suffix: 'PERN-STD-2',
      note: 'PERN',
      dw: false,
      material: 'Steel',
      tonnage: 6,
      issue: iso(recent),
      ob: complianceYear,
      purpose: `Second standard PERN for ${complianceYear} (bulk PERN-only selection)`
    }
  ]
  return rows.map((r) => {
    if (!MATERIALS.has(r.material))
      throw new Error(`bad material ${r.material}`)
    const future = new Date(`${r.issue}Z`) > now
    return {
      ...r,
      PrnNumber: `${SEED_PREFIX}${tag}-${r.suffix}`,
      skipped: future
        ? `issue date ${r.issue.slice(0, 10)} is after the frontend clock`
        : null
    }
  })
}

function unseed({ orgExternalId } = {}) {
  const where = `PrnNumber LIKE '${SEED_PREFIX}%'${orgExternalId ? ` AND OrganisationId='${orgExternalId}'` : ''}`
  sql(
    `BEGIN TRAN; DELETE h FROM PrnStatusHistory h JOIN Prn p ON p.Id = h.PrnIdFk WHERE p.${where}; DELETE FROM Prn WHERE ${where}; COMMIT;`
  )
  const state = readSeeded()
  state.prns = orgExternalId
    ? state.prns.filter(
        (p) => p.OrganisationId.toUpperCase() !== orgExternalId.toUpperCase()
      )
    : []
  fs.mkdirSync(STATE_DIR, { recursive: true })
  fs.writeFileSync(SEEDED_FILE, JSON.stringify(state, null, 2))
  return { removed: where }
}

// Replaces this org's MYDW-* rows. Each new row clones the non-key columns of an existing row of the same org
// (agency, accreditation, issuer…), so it renders like real data, and gets a status-4 history row.
function seed({ orgExternalId, tag, now, complianceYear, decemberYear }) {
  if (!fs.existsSync(SNAPSHOT_FILE))
    throw new Error(
      'Take the baseline --snapshot before seeding, so restore can tell seed rows from test changes.'
    )
  const D = decemberYear || decemberYearFor(now)
  const template = sqlJson(
    `SELECT TOP 1 Id FROM Prn WHERE OrganisationId='${orgExternalId}' AND PrnNumber NOT LIKE '${SEED_PREFIX}%' ORDER BY Id`
  )[0]
  if (!template)
    throw new Error(`No existing PRN for org ${orgExternalId} to clone from`)
  unseed({ orgExternalId })
  const plan = seedPlan({ tag, now, decemberYear: D, complianceYear })
  const inserts = plan
    .filter((r) => !r.skipped)
    .map(
      (r) => `
    INSERT INTO Prn (ExternalId, PrnNumber, OrganisationId, OrganisationName, ProducerAgency, ReprocessorExporterAgency,
      PrnStatusId, TonnageValue, MaterialName, IssuerNotes, IssuerReference, PrnSignatory, PrnSignatoryPosition, Signature,
      IssueDate, ProcessToBeUsed, DecemberWaste, StatusUpdatedOn, IssuedByOrg, AccreditationNumber, ReprocessingSite,
      AccreditationYear, ObligationYear, PackagingProducer, CreatedBy, CreatedOn, LastUpdatedBy, LastUpdatedDate, IsExport, SourceSystemId)
    SELECT NEWID(), ${sqlLiteral(r.PrnNumber)}, OrganisationId, OrganisationName, ProducerAgency, ReprocessorExporterAgency,
      4, ${r.tonnage}, ${sqlLiteral(r.material)}, ${sqlLiteral(`Seeded by mydw-manual-test: ${r.purpose}`)}, IssuerReference,
      PrnSignatory, PrnSignatoryPosition, Signature, ${sqlLiteral(r.issue)}, ProcessToBeUsed, ${r.dw ? 1 : 0}, NULL, IssuedByOrg,
      AccreditationNumber, ReprocessingSite, ${sqlLiteral(String(r.ob))}, ${sqlLiteral(String(r.ob))}, PackagingProducer,
      'mydw-manual-test', ${sqlLiteral(r.issue)}, LastUpdatedBy, SYSUTCDATETIME(), ${r.note === 'PERN' ? 1 : 0}, SourceSystemId
    FROM Prn WHERE Id = ${template.Id};
    INSERT INTO PrnStatusHistory (CreatedOn, CreatedByUser, CreatedByOrganisationId, PrnStatusIdFk, PrnIdFk, Comment, ObligationYear)
    VALUES (${sqlLiteral(r.issue)}, '00000000-0000-0000-0000-000000000000', '${orgExternalId}', 4, SCOPE_IDENTITY(), '${SEED_MARKER}', ${sqlLiteral(String(r.ob))});`
    )
    .join('\n')
  if (inserts) sql(`BEGIN TRAN; ${inserts} COMMIT;`)
  const rows = listPrns(orgExternalId).filter((p) =>
    p.PrnNumber.startsWith(`${SEED_PREFIX}${tag}-`)
  )
  const state = readSeeded()
  state.prns = [
    ...state.prns.filter(
      (p) => !p.PrnNumber.startsWith(`${SEED_PREFIX}${tag}-`)
    ),
    ...rows
  ]
  state.seededAt = new Date().toISOString()
  state.clock = now.toISOString()
  state.decemberYear = D
  fs.writeFileSync(SEEDED_FILE, JSON.stringify(state, null, 2))
  return {
    decemberYear: D,
    inserted: rows.map((p) => p.PrnNumber),
    skipped: plan
      .filter((r) => r.skipped)
      .map((r) => `${r.PrnNumber}: ${r.skipped}`),
    plan: plan.map((r) => `${r.PrnNumber} — ${r.purpose}`)
  }
}

// Obligation calculation rows for an org and year: none means the year has no H2 POM (MO-449 alternative content).
function calculationRows(orgExternalId, year) {
  return sqlJson(
    `SELECT COUNT(*) AS n FROM ObligationCalculations WHERE SubmitterId='${orgExternalId}' AND Year=${Number(year)} AND IsDeleted=0`
  )[0].n
}

module.exports = {
  calculationRows,
  sql,
  sqlJson,
  listPrns,
  snapshot,
  restore,
  status,
  setIssueDate,
  seed,
  unseed,
  decemberYearFor,
  readSeeded,
  SNAPSHOT_FILE,
  SEED_PREFIX
}
