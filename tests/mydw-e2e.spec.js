import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test, expect } from '../fixtures/pages.fixture.js'
import { resolveMatrixEntry } from '../.claude/skills/csoc-e2e/data/matrix.js'
import {
  connect as connectPrnDb,
  STATUS
} from '../.claude/skills/mydw-e2e/prn-db.mjs'

// Automated MY&DW (Multi-Year obligations + December Waste) release checks, driven by
// .claude/skills/mydw-e2e/runner.mjs. One test per case in the MY&DW release test cases (TST-xx / LOC-xx).
//
//   MYDW_RUN=1         harness flag; without it the spec is a no-op, so `npm test` leaves it alone
//   MYDW_ENV           local | tst
//   REGULATOR/ORG_TYPE matrix cell; tst signs in with the csoc-e2e accounts (data/accounts.json),
//                      local with the seeded EA accounts (POP QUEST = DRP, Organisation Name = CS)
//   MYDW_SCENARIO      local time-shift scenario (S1|S2|S3); REAL in tst
//   MYDW_NOW           frontend clock (ISO) for local; tst uses the real date
//   MYDW_CASES         comma-separated case ids, or all (every case in scope for the env/scenario)
//   MYDW_FLAG_MY/_DW   true|false when known (local preflight); unset in tst. A LOCAL run with one flag off
//                      (runner --flags-off MY|DW) runs only the case for that flag (LOC-16 / LOC-17)
//   EVIDENCE_DIR       screenshots + downloads for the Word pack
//   MYDW_TST_DB_*      tst PRN database (read-only) for the audit/CSV checks; see .claude/skills/mydw-e2e/prn-db.mjs
//
// Expectations come from the frontend flag state (detected from the home tile), the clock and the shared
// copy/rules modules in .claude/skills/mydw-e2e/local, so the same cases run before and after launch.

const require = createRequire(import.meta.url)
const SKILL = '../.claude/skills/mydw-e2e/local'
const copy = require(`${SKILL}/lib/copy.js`)
const rules = require(`${SKILL}/lib/rules.js`)
const pages = require(`${SKILL}/lib/pages.js`)

const RUN = process.env.MYDW_RUN === '1'
const ENV = process.env.MYDW_ENV || 'local'
const LOCAL = ENV === 'local'
const REGULATOR = process.env.REGULATOR || 'EA'
const ORG_TYPE = process.env.ORG_TYPE || 'DRP'
const SCENARIO = process.env.MYDW_SCENARIO || (LOCAL ? 'S2' : 'REAL')
const NOW = process.env.MYDW_NOW ? new Date(process.env.MYDW_NOW) : new Date()
const C = rules.complianceYear(NOW)
const CASES = new Set(
  (process.env.MYDW_CASES || '').split(',').map((c) => c.trim())
)
const MY_FLAG =
  process.env.MYDW_FLAG_MY === undefined
    ? null
    : process.env.MYDW_FLAG_MY === 'true'
const DW_FLAG =
  process.env.MYDW_FLAG_DW === undefined
    ? null
    : process.env.MYDW_FLAG_DW === 'true'

// Local-only helpers (SQL against the local stack). Loaded lazily so tst runs need no docker.
const db = LOCAL && RUN ? require(`${SKILL}/lib/db.js`) : null
const localUser =
  LOCAL && RUN ? require(`${SKILL}/config.js`).userFor(ORG_TYPE, 'AP') : null
const account = !LOCAL && RUN ? resolveMatrixEntry(REGULATOR, ORG_TYPE) : null
const ORG_ID = LOCAL && RUN ? localUser.orgExternalId : null
// PRN owner ids in the PRN database. tst holds a compliance scheme's notes under its complianceSchemeId.
const ORG_IDS = !RUN
  ? []
  : LOCAL
    ? [ORG_ID]
    : [account.organisationId, account.complianceSchemeId].filter(Boolean)
const ZERO_GUID = '00000000-0000-0000-0000-000000000000'
const TAG = ORG_TYPE === 'DRP' ? 'DP' : 'CS'

const inWindow = () => {
  const m = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      month: 'numeric'
    }).format(NOW)
  )
  return m === 12 || m === 1
}

test.use({
  storageState: { cookies: [], origins: [] },
  ignoreHTTPSErrors: true
})

// ---------------------------------------------------------------------------------------------- helpers

const clean = (t) =>
  String(t || '')
    .replace(/\s+/g, ' ')
    .trim()
const mainText = async (page) => clean(await page.locator('main').innerText())

async function signIn(page) {
  // A frontend that has just been restarted (scenario or flag switch) can take a while to answer the
  // first requests, so sign-in is retried rather than failing the whole account.
  await expect(async () => {
    await signInOnce(page)
  }).toPass({ intervals: [10_000], timeout: 300_000 })
}

async function signInOnce(page) {
  await page.goto('/report-data', { timeout: 90_000 })
  if (LOCAL) {
    if (page.url().includes(':8443')) {
      await page
        .locator(`button[name="b2cmock_user"][value="${localUser.userId}"]`)
        .click({ noWaitAfter: true })
    }
  } else {
    // The sign-in form, or the app's error page with its "sign in" link.
    await page
      .getByLabel(/email/i)
      .or(page.getByRole('link', { name: /sign in/i }))
      .first()
      .waitFor()
    if (page.url().includes('error')) {
      await page.getByRole('link', { name: /sign in/i }).click()
    }
    await page.getByLabel(/email/i).fill(account.username)
    await page.getByLabel(/password/i).fill(account.password)
    await page.getByRole('button', { name: /sign in|continue|next/i }).click()
  }
  await page
    .getByRole('heading', { name: /^Account home/ })
    .waitFor({ timeout: 90_000 })
  const accept = page.getByRole('button', { name: /accept analytics cookies/i })
  if (await accept.count()) {
    await accept.click()
    const hide = page.getByRole('button', {
      name: /hide (this )?(cookie )?message/i
    })
    if (await hide.count()) await hide.first().click()
  }
}

async function flagOn(page) {
  await page.goto('/report-data')
  return (await pages.home.manageObligationsLink(page).count()) > 0
}

async function openYear(page, year, multiYear) {
  if (multiYear) {
    await pages.chooseYear.choose(page, year)
  } else {
    await page.goto(pages.obligations.path)
  }
  await expect(pages.obligations.heading(page, year)).toBeVisible()
}

function calculatedFromGrid(grid) {
  return Object.entries(grid).some(
    ([name, row]) => name !== 'Totals' && /^\d/.test(row.toMeet || '')
  )
}

async function isCalculated(page, year) {
  if (LOCAL) return db.calculationRows(ORG_ID, year) > 0
  return calculatedFromGrid(await pages.obligations.readGrid(page))
}

const num = (v) => Number(String(v || '0').replace(/[^\d.-]/g, '')) || 0

// Obligations page for a year: Totals row, every material row and "Number of PRNs and PERNs awaiting acceptance".
async function totals(page, year, multiYear) {
  await openYear(page, year, multiYear)
  const grid = await pages.obligations.readGrid(page)
  const m = (await mainText(page)).match(
    /Number of PRNs and PERNs awaiting acceptance (\d+)/
  )
  return {
    accepted: num(grid.Totals && grid.Totals.accepted),
    awaiting: num(grid.Totals && grid.Totals.awaiting),
    count: m ? Number(m[1]) : null,
    grid
  }
}

// Obligations table row for a note's material (Glass re-melt/other -> Glass; paper, board, fibre -> Paper ...).
function materialRow(grid, material) {
  const m = String(material || '').toLowerCase()
  const key = /glass/.test(m)
    ? 'glass'
    : /paper|fibre|board/.test(m)
      ? 'paper'
      : /alumin/.test(m)
        ? 'aluminium'
        : /plastic/.test(m)
          ? 'plastic'
          : /steel/.test(m)
            ? 'steel'
            : /wood/.test(m)
              ? 'wood'
              : null
  const name =
    key && Object.keys(grid).find((n) => n.toLowerCase().startsWith(key))
  return name
    ? {
        name,
        accepted: num(grid[name].accepted),
        awaiting: num(grid[name].awaiting)
      }
    : null
}

// What accepting or rejecting should do to a year's obligations page: tonnage moves out of "awaiting"
// (and, for an accept, into "accepted") in the Totals row and the note's material row, and the
// awaiting count goes down.
function expectObligationsChange(
  before,
  after,
  { label, material, accepted, awaiting, count }
) {
  expect
    .soft(after.accepted - before.accepted, `${label}: Totals accepted`)
    .toBe(accepted)
  expect
    .soft(before.awaiting - after.awaiting, `${label}: Totals awaiting`)
    .toBe(awaiting)
  if (count !== undefined) {
    expect.soft(before.count, `${label}: awaiting count shown`).not.toBeNull()
    if (before.count !== null && after.count !== null) {
      expect
        .soft(
          before.count - after.count,
          `${label}: number awaiting acceptance`
        )
        .toBe(count)
    }
  }
  if (!material) return
  const b = materialRow(before.grid, material)
  const a = materialRow(after.grid, material)
  expect.soft(!!b && !!a, `${label}: ${material} row`).toBe(true)
  if (!a || !b) return
  expect
    .soft(a.accepted - b.accepted, `${label}: ${b.name} accepted`)
    .toBe(accepted)
  expect
    .soft(b.awaiting - a.awaiting, `${label}: ${b.name} awaiting`)
    .toBe(awaiting)
}

// After a reject: gone from the accept/reject list, REJECTED on the search page.
async function expectRejected(page, snap, number) {
  expect
    .soft(
      (await listRows(page)).some((r) => r.num === number),
      `${number} still on the accept/reject list`
    )
    .toBe(false)
  await page.goto(pages.prnList.path)
  await snap('Accept or reject list after rejecting')
  await expectSearchStatus(page, number, 'REJECTED')
  await page.goto(`${pages.search.path}?search=${number}`)
  await snap(`Search: ${number} rejected`)
}

// Status of a note in the search results (e.g. ACCEPTED, REJECTED).
async function expectSearchStatus(page, number, status) {
  const rows = await pages.readListRows(
    page,
    pages.search.path,
    `search=${number}`
  )
  const r = rows.find((x) => x.num === number)
  expect
    .soft(r && r.cells[r.cells.length - 1], `${number} status on search`)
    .toBe(status)
}

// Awaiting rows on every page of the accept/reject list, with the note type and tonnage.
async function listRows(page) {
  const rows = await pages.readListRows(page)
  return rows.map((r) => ({
    ...r,
    tonnes: num(r.cells[r.cells.length - 2])
  }))
}

// Material of a list row (the first cell naming a material).
const rowMaterial = (r) =>
  r.cells.find((c) =>
    /glass|paper|fibre|board|alumin|plastic|steel|wood/i.test(c)
  ) || ''

// Opens awaiting notes until one matches; returns { id, number, note, dw, tonnes, material } or null.
async function findNote(page, { note, dw, selectable }) {
  for (const r of await listRows(page)) {
    if (selectable !== undefined && r.cb !== selectable) continue
    await page.goto(pages.prn.path(r.id))
    const h1 = clean(await page.locator('main h1').first().innerText())
    const found = h1.includes('Export') ? 'PERN' : 'PRN'
    const isDw = /December waste\? Yes/i.test(await mainText(page))
    if ((!note || found === note) && (dw === undefined || isDw === dw)) {
      return {
        id: r.id,
        number: r.num,
        note: found,
        dw: isDw,
        tonnes: r.tonnes,
        material: rowMaterial(r)
      }
    }
  }
  return null
}

function noteById(number) {
  return db.listPrns(ORG_ID).find((p) => p.PrnNumber === number)
}

function dbSkipped(prnDb, what) {
  test.info().annotations.push({
    type: 'note',
    description: `${what} not checked: ${prnDb.reason}`
  })
}

// Audit trail after an accept/reject (scope: Auditing): the note's status and obligation year, and the
// status-history row the action wrote with who did it. Runs before any LOCAL restore removes the row.
async function expectAudit(prnDb, number, { status, year }) {
  if (!prnDb.available) return dbSkipped(prnDb, `${number} audit trail`)
  const p = await prnDb.prn(ORG_IDS, number)
  expect(p, `${number} in the PRN database`).toBeTruthy()
  const h = await prnDb.lastHistory(p.Id)
  expect(h, `${number} status history`).toBeTruthy()
  expect.soft(Number(p.PrnStatusId), `${number} DB status`).toBe(status)
  expect.soft(Number(h.PrnStatusIdFk), `${number} audit status`).toBe(status)
  if (year) {
    expect
      .soft(p.ObligationYear, `${number} DB obligation year`)
      .toBe(String(year))
    expect
      .soft(h.ObligationYear, `${number} audit obligation year`)
      .toBe(String(year))
  }
  expect
    .soft(
      String(h.CreatedByUser || ZERO_GUID).toUpperCase(),
      `${number} audit user`
    )
    .not.toBe(ZERO_GUID)
  // CreatedByOrganisationId is all zeros (K19): not specific to MY&DW, so not asserted here.
}

// Clicks the obligations page's CSV link. With no notes for the year the service shows a page
// ("You have no PRNs or PERNs issued to your Y recycling obligations.") instead of a file.
// Returns the saved file, or null for that page.
async function downloadCsv(page, year, dir) {
  const download = page
    .waitForEvent('download', { timeout: 30_000 })
    .catch(() => null)
  await pages.obligations.csvLink(page).click()
  const emptyText = page.getByText(
    /You have no PRNs or PERNs issued to your \d{4} recycling obligations\./
  )
  const empty = emptyText
    .waitFor({ timeout: 30_000 })
    .then(() => 'empty')
    .catch(() => null)
  const first = await Promise.race([download, empty])
  if (first === 'empty') {
    // K17: on tst the page names the current year whichever year was chosen.
    expect
      .soft(
        await emptyText.innerText(),
        `${year} CSV: "no PRNs or PERNs" page year`
      )
      .toContain(`your ${year} recycling obligations`)
    return null
  }
  const d = first || (await download)
  if (!d) throw new Error(`${year} CSV: no file and no "no PRNs or PERNs" page`)
  const file = path.join(dir, `${ORG_TYPE}-${year}-${d.suggestedFilename()}`)
  await d.saveAs(file)
  return file
}

// Confirm page heading and browser title. The PERN wording (legacy heading, "Accept this PRN" title: K12)
// is not specific to MY&DW, so for PERNs only the year in the heading is checked.
async function expectConfirmHeading(page, note, year, expected) {
  if (note === 'PERN') {
    await expect
      .soft(pages.acceptConfirm.question(page))
      .toContainText(`towards your ${year} recycling obligations`)
    return
  }
  await expect
    .soft(pages.acceptConfirm.question(page))
    .toHaveText(expected.heading)
  expect
    .soft((await page.title()).split(' - ')[0], 'browser title')
    .toBe(expected.title)
}

// Text of a PRN/PERN PDF. The page draws the PDF as an image from HTML it fetches from
// /report-data/download-<kind>-pdf/<id> (assets/js/download-pdf.js), so that HTML is what the PDF shows.
async function pdfText(page, kind, id) {
  const res = await page.request.get(`/report-data/download-${kind}-pdf/${id}`)
  expect(res.ok(), `${kind} PDF content`).toBe(true)
  const { htmlContent } = await res.json()
  return page.evaluate((h) => {
    const d = document.createElement('div')
    d.innerHTML = h
    return d.textContent.replace(/\s+/g, ' ').trim()
  }, htmlContent)
}

// Language toggle: /report-data/culture?culture=cy|en&returnUrl=~/<path>.
async function setLanguage(page, lang, path = '/report-data') {
  const back = '~' + path.replace(/^\/report-data/, '')
  await page.goto(
    `/report-data/culture?culture=${lang}&returnUrl=${encodeURIComponent(back)}`
  )
}

// PRN/PERN numbers (first column) of a downloaded CSV, sorted.
function csvNumbers(file) {
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .slice(1)
    .filter((l) => l.trim())
    .map((l) => l.split(',')[0].replace(/^"|"$/g, '').trim())
    .sort()
}

// MO-435 AC1: a year's CSV holds every note for that obligation year, plus December Waste notes awaiting
// acceptance that can still be accepted into it.
function belongsToYear(p, year) {
  return (
    Number(p.ObligationYear) === year ||
    rules.expectedFor(p, NOW).years.includes(year)
  )
}

// ---------------------------------------------------------------------------------------------- cases

// scope: which env/scenarios a case runs in. org: limit to an org type. mutates: accepts or rejects data.
/* eslint-disable playwright/no-standalone-expect -- each case's run() is called from the test() below */
const CASE_DEFS = [
  {
    id: 'TST-01',
    title: 'Home page tile',
    stories: 'MO-326',
    scope: { tst: true, local: ['S2', 'S3'] },
    async run({ page, snap, multiYear }) {
      const t = copy.tile({ flagOn: multiYear, orgType: ORG_TYPE, year: C })
      await page.goto('/report-data')
      await expect(page.getByRole('link', { name: t.link })).toBeVisible()
      const text = await mainText(page)
      for (const line of t.lines) expect.soft(text).toContain(line)
      if (t.anyOf) {
        expect
          .soft(
            t.anyOf.some((line) => text.includes(line)),
            `tile shows one of: ${t.anyOf.join(' | ')}`
          )
          .toBe(true)
      }
      await snap('Account home tile')
      if (t.searchLink) {
        await page.getByRole('link', { name: t.searchLink }).click()
        await expect(pages.search.heading(page)).toBeVisible()
        await snap('Search all PRNs and PERNs')
      } else {
        await expect(
          page.getByRole('link', { name: /^search all prns and perns$/i })
        ).toHaveCount(0)
      }
    }
  },
  {
    id: 'TST-03',
    title: 'Choose a year page',
    stories: 'MO-327',
    scope: { tst: true, local: ['S2', 'S3'] },
    async run({ page, snap, multiYear }) {
      if (!multiYear) {
        const res = await page.goto(pages.chooseYear.path)
        await snap('Choose a year with the flag off')
        expect(res.status(), 'choose-year page is feature-gated').toBe(404)
        return
      }
      await page.goto('/report-data')
      await pages.home.manageObligationsLink(page).click()
      await expect(pages.chooseYear.heading(page)).toBeVisible()
      const offered = await pages.chooseYear
        .radios(page)
        .evaluateAll((r) => r.map((x) => Number(x.value)))
      expect(offered).toEqual(rules.yearOptions(NOW))
      await expect(
        pages.chooseYear.radios(page).locator(':checked')
      ).toHaveCount(0)
      await snap('Choose a year')
      await pages.chooseYear.continue(page).click()
      await expect(pages.chooseYear.errorSummary(page)).toContainText(
        'Select a year'
      )
      await snap('Choose a year: no selection error')
      await pages.chooseYear.radio(page, C).check()
      await pages.chooseYear.continue(page).click()
      await expect(pages.obligations.heading(page, C)).toBeVisible()
      await snap(`Manage your ${C} recycling obligations`)
    }
  },
  {
    id: 'TST-04',
    title: 'Current year obligations page',
    stories: 'MO-449, MO-394, MO-435',
    scope: { tst: true, local: ['S2'] },
    async run({ page, snap, multiYear, evidence }) {
      await openYear(page, C, multiYear)
      const text = await mainText(page)
      expect.soft(text).toContain(copy.deadline(C))
      const calculated = await isCalculated(page, C)
      const section = await pages.obligations.readHowToMeet(page)
      expect(section, '"How to meet" section').not.toBeNull()
      expect
        .soft(section.lines)
        .toEqual(copy.howToMeet({ flagOn: multiYear, calculated, year: C }))
      expect.soft(section.details, 'no December Waste details box').toBeNull()
      await snap(`Manage your ${C} recycling obligations`)
      if (multiYear) {
        // The year sits in the link text; its accessible name differs, so match text + target.
        const list = page
          .locator('main a[href$="view-awaiting-acceptance-alt"]')
          .filter({ hasText: `for ${C}` })
        await expect(list).toHaveCount(1)
        await list.click()
        await expect(pages.prnList.heading(page)).toBeVisible()
        await snap(`Accept or reject PRNs and PERNs (from ${C})`)
        await openYear(page, C, true)
        await expect(pages.obligations.csvLink(page)).toContainText(String(C))
        await downloadCsv(page, C, evidence || test.info().outputDir)
      }
    }
  },
  {
    id: 'TST-05',
    title: 'Future year obligations page',
    stories: 'MO-382, MO-449, MO-394, MO-435, MO-328, MO-329',
    scope: { tst: true, local: ['S1', 'S2', 'S3'] },
    async run({ page, snap, multiYear }) {
      test.skip(!multiYear, 'ShowMultiYearObligations is off: no future year')
      const year = C + 1
      await openYear(page, year, true)
      expect.soft(await mainText(page)).toContain(copy.deadline(year))
      const grid = await pages.obligations.readGrid(page)
      for (const [name, row] of Object.entries(grid)) {
        if (name !== 'Totals') expect.soft(row.status, name).toBe('NO DATA YET')
      }
      const calculated = await isCalculated(page, year)
      const section = await pages.obligations.readHowToMeet(page)
      expect
        .soft(section.lines)
        .toEqual(copy.howToMeet({ flagOn: true, calculated, year }))
      const twoYearDw = LOCAL
        ? db
            .listPrns(ORG_ID)
            .some((p) => rules.expectedFor(p, NOW).choiceOfYear)
        : false
      const expectDetails = !calculated && inWindow() && twoYearDw
      await snap(`Manage your ${year} recycling obligations`)
      const list = page
        .locator('main a[href$="view-awaiting-acceptance-alt"]')
        .filter({ hasText: `for ${year}` })
      await expect(list).toHaveCount(1)
      await list.click()
      await expect(pages.prnList.heading(page)).toBeVisible()
      await snap(`Accept or reject PRNs and PERNs (from ${year})`)
      await openYear(page, year, true)
      if (!expectDetails) {
        expect.soft(section.details, 'details box').toBeNull()
        return
      }
      expect(section.details && section.details.summary).toBe(
        copy.DETAILS_HEADING
      )
      expect
        .soft(section.details.open, 'details box collapsed by default')
        .toBe(false)
      await page.locator('main details summary').first().click()
      expect
        .soft((await pages.obligations.readHowToMeet(page)).details.lines)
        .toEqual(copy.detailsLines(year))
      await snap('December waste details box expanded')
    }
  },
  {
    id: 'TST-06',
    title: '2025 obligations page',
    stories: 'MO-393',
    scope: { tst: true, local: ['S2'] },
    async run({ page, snap, multiYear }) {
      test.skip(!multiYear, 'ShowMultiYearObligations is off: no year choice')
      test.skip(!rules.yearOptions(NOW).includes(2025), '2025 not offered')
      await pages.chooseYear.choose(page, 2025)
      const r = copy.record2025({ orgType: ORG_TYPE })
      await expect(page.locator('main h1')).toHaveText(r.heading)
      await expect(
        page.getByRole('link', { name: copy.REGULATOR_MAILBOX[REGULATOR] })
      ).toBeVisible()
      for (const link of r.links) {
        await expect(page.getByRole('link', { name: link })).toBeVisible()
      }
      await expect(page.locator('main table')).toHaveCount(0)
      await snap('2025 record page')
    }
  },
  ...['PRN', 'PERN'].map((note) => ({
    id: note === 'PRN' ? 'TST-08' : 'TST-09',
    title: `Accept a single standard ${note}`,
    stories: 'MO-331, MO-332, MO-309, MO-310, audit',
    scope: { tst: true, local: ['S2'] },
    mutates: true,
    async run({ page, snap, multiYear, evidence, prnDb }) {
      const before = await totals(page, C, multiYear)
      const found = await findNote(page, { note, dw: false, selectable: true })
      test.skip(
        !found,
        `no awaiting single-year standard ${note} for this account`
      )
      await page.goto(pages.prn.path(found.id))
      await snap(`${found.number} before accepting`)
      await pages.prn.acceptLink(page).click()
      await expect(page).toHaveURL(/accept-prn\//)
      const body = clean(await page.locator('main').innerText())
      const m = body.match(
        multiYear
          ? /This will contribute (\d+) tonnes towards your recycling obligation for ([^.]+)\./
          : /This will credit (\d+) tonnes towards your (.+?) recycling obligation\./
      )
      expect(m, 'confirm body').not.toBeNull()
      const c = copy.confirm({
        flagOn: multiYear,
        note,
        year: C,
        tonnes: m[1],
        material: m[2]
      })
      await expectConfirmHeading(page, note, C, c)
      expect.soft(Number(m[1]), 'tonnage').toBe(found.tonnes)
      await snap('Are you sure page')
      await pages.acceptConfirm.yes(page).click()
      const a = copy.accepted({
        flagOn: multiYear,
        note,
        year: C,
        tonnes: m[1],
        material: m[2]
      })
      await expect(pages.accepted.banner(page)).toContainText(a.banner)
      await expect.soft(pages.accepted.banner(page)).toContainText(a.body)
      if (a.acceptedTowards && DW_FLAG !== false) {
        await expect.soft(page.getByText(a.acceptedTowards)).toBeVisible()
      }
      await snap('Accepted')
      await expectAudit(prnDb, found.number, {
        status: STATUS.ACCEPTED,
        year: multiYear ? C : null
      })
      if (a.acceptedTowards && DW_FLAG !== false) {
        expect
          .soft(await pdfText(page, 'accepted-prn', found.id), 'PDF')
          .toContain(a.acceptedTowards)
        // Step 6: the note opened again from search also shows the year.
        await page.goto(`${pages.search.path}?search=${found.number}`)
        await page
          .locator('main a[href*="selected-prn"]')
          .filter({ hasText: found.number })
          .first()
          .click()
        await expect.soft(page.getByText(a.acceptedTowards)).toBeVisible()
        await snap(`${found.number} opened from search`)
      }
      const pdf = page.getByRole('button', {
        name: /download this (prn|pern)/i
      })
      if (await pdf.count()) {
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          pdf.first().click()
        ])
        if (evidence) {
          await download.saveAs(
            path.join(evidence, `${found.number}-accepted.pdf`)
          )
        }
      }
      const after = await totals(page, C, multiYear)
      expectObligationsChange(before, after, {
        label: `${C} after accepting ${found.number}`,
        material: found.material,
        accepted: found.tonnes,
        awaiting: found.tonnes,
        count: 1
      })
      await snap('Obligations after accepting')
      await expectSearchStatus(page, found.number, 'ACCEPTED')
    }
  })),
  {
    id: 'TST-10',
    title: 'Multi-select accept',
    stories: 'MO-335, MO-307, audit',
    scope: { tst: true, local: ['S2'] },
    mutates: true,
    async run({ page, snap, multiYear, prnDb }) {
      const before = await totals(page, C, multiYear)
      await page.goto(pages.prnList.path)
      const rows = (await listRows(page)).filter((r) => r.cb && r.page === 1)
      test.skip(rows.length < 2, 'fewer than 2 selectable notes on page 1')
      const picked = rows.slice(0, 2)
      await page.goto(pages.prnList.path)
      for (const r of picked) await pages.prnList.checkbox(page, r.num).check()
      await snap('Two notes selected')
      await pages.prnList.acceptSelected(page).click()
      await expect(pages.bulk.reviewHeading(page)).toBeVisible()
      await snap('Review your selection')
      await pages.bulk.accept(page).click()
      await expect(page).toHaveURL(/accepted-prns/)
      await expect(pages.bulk.panelHeading(page)).toHaveText(
        copy.acceptedMany({ flagOn: multiYear, year: C })
      )
      if (multiYear) {
        await expect
          .soft(pages.bulk.progressLink(page))
          .toHaveClass(/govuk-button--secondary/)
      }
      await snap('Accepted (multi-select)')
      for (const r of picked) {
        await expectAudit(prnDb, r.num, {
          status: STATUS.ACCEPTED,
          year: multiYear ? C : null
        })
      }
      const after = await totals(page, C, multiYear)
      const sum = picked.reduce((s, r) => s + r.tonnes, 0)
      expectObligationsChange(before, after, {
        label: `${C} after accepting ${picked.length} notes`,
        accepted: sum,
        awaiting: sum,
        count: picked.length
      })
      for (const r of picked) {
        const b = materialRow(before.grid, rowMaterial(r))
        const a = materialRow(after.grid, rowMaterial(r))
        const same = picked
          .filter(
            (x) => materialRow(before.grid, rowMaterial(x))?.name === b?.name
          )
          .reduce((s, x) => s + x.tonnes, 0)
        if (a && b) {
          expect.soft(a.accepted - b.accepted, `${b.name} accepted`).toBe(same)
        }
      }
      await snap('Obligations after accepting')
    }
  },
  {
    id: 'TST-11',
    title: 'Multi-select accept: a PRN and a PERN together',
    stories: 'MO-335, MO-307, audit',
    // Current-year standard notes only: December Waste notes can't be multi-selected by design (MO-307).
    scope: { local: ['S2'] },
    mutates: true,
    async run({ page, snap, multiYear, prnDb }) {
      const isPern = Object.fromEntries(
        db
          .listPrns(ORG_ID)
          .map((p) => [p.PrnNumber, p.IsExport === true || p.IsExport === 1])
      )
      // Selections don't carry across pages, so use a page that has both a selectable PRN and PERN.
      const rows = (await listRows(page)).filter((r) => r.cb)
      const listPage = [...new Set(rows.map((r) => r.page))].find(
        (n) =>
          rows.some((r) => r.page === n && isPern[r.num] === false) &&
          rows.some((r) => r.page === n && isPern[r.num] === true)
      )
      test.skip(!listPage, 'no list page with both a selectable PRN and PERN')
      const onPage = rows.filter((r) => r.page === listPage)
      const prn = onPage.find((r) => isPern[r.num] === false)
      const pern = onPage.find((r) => isPern[r.num] === true)
      const before = await totals(page, C, multiYear)
      await page.goto(`${pages.prnList.path}?page=${listPage}`)
      for (const r of [prn, pern])
        await pages.prnList.checkbox(page, r.num).check()
      await snap('One PRN and one PERN selected')
      await pages.prnList.acceptSelected(page).click()
      await expect(pages.bulk.reviewHeading(page)).toBeVisible()
      await snap('Review your selection')
      await pages.bulk.accept(page).click()
      await expect(page).toHaveURL(/accepted-prns/)
      await expect(pages.bulk.panelHeading(page)).toHaveText(
        new RegExp(
          `You[’']ve accepted 2 PRNs and PERNs towards your ${C} recycling obligations`
        )
      )
      await snap('Accepted (PRN and PERN)')
      for (const r of [prn, pern]) {
        await expectAudit(prnDb, r.num, { status: STATUS.ACCEPTED, year: C })
      }
      const after = await totals(page, C, multiYear)
      expectObligationsChange(before, after, {
        label: `${C} after accepting a PRN and a PERN`,
        accepted: prn.tonnes + pern.tonnes,
        awaiting: prn.tonnes + pern.tonnes,
        count: 2
      })
      for (const r of [prn, pern]) {
        const b = materialRow(before.grid, rowMaterial(r))
        const a = materialRow(after.grid, rowMaterial(r))
        const same = [prn, pern]
          .filter(
            (x) => materialRow(before.grid, rowMaterial(x))?.name === b?.name
          )
          .reduce((s, x) => s + x.tonnes, 0)
        if (a && b) {
          expect.soft(a.accepted - b.accepted, `${b.name} accepted`).toBe(same)
        }
      }
      await snap('Obligations after accepting')
    }
  },
  ...['PRN', 'PERN'].map((note) => ({
    id: note === 'PRN' ? 'TST-13' : 'TST-22',
    title: `Reject a single standard ${note}`,
    stories: 'regression, audit',
    scope: { tst: true, local: ['S2'] },
    mutates: true,
    async run({ page, snap, multiYear, prnDb }) {
      const before = await totals(page, C, multiYear)
      const found = await findNote(page, { note, dw: false, selectable: true })
      test.skip(
        !found,
        `no awaiting single-year standard ${note} for this account`
      )
      await page.goto(pages.prn.path(found.id))
      await pages.prn.rejectLink(page).click()
      await expect(pages.reject.question(page)).toHaveText(
        `Reject this ${note}?`
      )
      await expect(page.locator('main')).toContainText(
        'This is permanent and cannot be undone.'
      )
      await snap('Reject confirmation')
      await pages.reject.noGoBack(page).click()
      await expect(page).toHaveURL(/selected-prn\//)
      await pages.prn.rejectLink(page).click()
      await pages.reject.yes(page).click()
      await expect(page.locator('main')).toContainText(`${note} rejected.`)
      await snap('Rejected')
      await expectAudit(prnDb, found.number, { status: STATUS.REJECTED })
      await expectRejected(page, snap, found.number)
      const after = await totals(page, C, multiYear)
      expectObligationsChange(before, after, {
        label: `${C} after rejecting ${found.number}`,
        material: found.material,
        accepted: 0,
        awaiting: found.tonnes,
        count: 1
      })
      await snap('Obligations after rejecting')
    }
  })),
  {
    id: 'TST-14',
    title: 'No December Waste tags outside December/January',
    stories: 'MO-306, MO-308, MO-311',
    scope: { tst: true, local: ['S3'] },
    async run({ page, snap }) {
      test.skip(
        inWindow(),
        'clock is in the December/January window: see LOC-02'
      )
      await page.goto(pages.prnList.path)
      const list = await listRows(page)
      expect(list.filter((r) => r.flash).map((r) => r.num)).toEqual([])
      await snap('Accept or reject list: no tags')
      const search = await pages.readListRows(page, pages.search.path)
      expect(search.filter((r) => r.flash).map((r) => r.num)).toEqual([])
      await snap('Search: no tags')
      if (LOCAL) {
        const p = noteById(`MYDW-${TAG}-PRN-DW-DEC`)
        test.skip(!p, 'seeded December PRN missing')
        await page.goto(pages.prn.path(p.ExternalId.toLowerCase()))
        await expect(page.locator('main')).toContainText(
          copy.decemberWarning('PRN', Number(p.ObligationYear))
        )
        await expect(page.getByText(/Can be accepted towards/)).toHaveCount(0)
        await snap('December Waste PRN page: no tag')
      }
    }
  },
  {
    id: 'TST-17',
    title: 'Welsh',
    stories: 'MO-575',
    scope: { tst: true, local: ['S2'] },
    async run({ page, snap, multiYear }) {
      test.skip(!multiYear, 'ShowMultiYearObligations is off')
      const english = {
        tile: copy.tile({ flagOn: true, orgType: ORG_TYPE, year: C }).lines[0],
        chooseYear: 'Choose a year',
        selectYear: 'Select a year',
        howToMeet: 'How to meet your recycling obligations'
      }
      try {
        await setLanguage(page, 'cy')
        await page.goto('/report-data')
        await expect
          .soft(page.locator('html'), 'html lang')
          .toHaveAttribute('lang', 'cy')
        expect
          .soft(await mainText(page), 'tile in Welsh')
          .not.toContain(english.tile)
        await snap('Account home (Cymraeg)')
        await page.goto(pages.chooseYear.path)
        expect
          .soft(
            clean(await page.locator('main h1').innerText()),
            'Choose a year in Welsh'
          )
          .not.toBe(english.chooseYear)
        await pages.chooseYear.continue(page).click()
        expect
          .soft(
            await pages.chooseYear.errorSummary(page).innerText(),
            'error in Welsh'
          )
          .not.toContain(english.selectYear)
        await snap('Choose a year (Cymraeg)')
        await pages.chooseYear.radio(page, C).check()
        await pages.chooseYear.continue(page).click()
        expect
          .soft(await mainText(page), '"How to meet" in Welsh')
          .not.toContain(english.howToMeet)
        await snap(`Manage ${C} (Cymraeg)`)
      } finally {
        await setLanguage(page, 'en')
      }
    }
  },
  {
    id: 'TST-19',
    title: 'CSV download is year-specific',
    stories: 'MO-435',
    scope: { tst: true, local: ['S1', 'S2'] },
    async run({ page, snap, evidence, multiYear, prnDb }) {
      test.skip(!multiYear, 'ShowMultiYearObligations is off: no year choice')
      const csv = {}
      for (const year of [C, C + 1]) {
        await openYear(page, year, true)
        await expect(pages.obligations.csvLink(page)).toContainText(
          String(year)
        )
        const file = await downloadCsv(
          page,
          year,
          evidence || test.info().outputDir
        )
        if (!file) await snap(`No PRNs or PERNs for ${year}`)
        csv[year] = file ? csvNumbers(file) : []
      }
      await snap(`Manage your ${C + 1} recycling obligations (CSV link)`)
      test.info().annotations.push({
        type: 'note',
        description: `CSV rows: ${C}=${csv[C].length}, ${C + 1}=${csv[C + 1].length}`
      })
      if (csv[C].length || csv[C + 1].length) {
        expect
          .soft(csv[C], `${C} and ${C + 1} CSVs differ`)
          .not.toEqual(csv[C + 1])
      }
      if (!prnDb.available) return dbSkipped(prnDb, 'CSV contents')
      const prns = await prnDb.listPrns(ORG_IDS)
      for (const year of [C, C + 1]) {
        expect.soft(csv[year], `${year} CSV: notes for ${year} only`).toEqual(
          prns
            .filter((p) => belongsToYear(p, year))
            .map((p) => p.PrnNumber)
            .sort()
        )
      }
    }
  },
  {
    id: 'TST-20',
    title: 'Accept a note found with search',
    stories: 'MO-311, MO-330, audit',
    scope: { tst: true, local: ['S2'] },
    mutates: true,
    async run({ page, snap, multiYear, prnDb }) {
      // LOCAL accepts the seeded December Waste PRN (scope: accept December Waste from global search).
      let number, tonnes, material
      if (LOCAL) {
        const p = noteById(`MYDW-${TAG}-PRN-DW-DEC`)
        test.skip(!p, 'seeded December PRN missing')
        ;({
          PrnNumber: number,
          TonnageValue: tonnes,
          MaterialName: material
        } = p)
      } else {
        const found = await findNote(page, { selectable: true })
        test.skip(!found, 'no awaiting single-year note for this account')
        ;({ number, tonnes, material } = found)
      }
      // A December Waste note is awaiting in both years, so read both before accepting.
      const years = LOCAL && multiYear ? [C, C + 1] : [C]
      const before = {}
      for (const y of years) before[y] = await totals(page, y, multiYear)
      await page.goto(pages.search.path)
      await page.locator('#search').fill(number)
      await page
        .locator('main form')
        .getByRole('button', { name: /^search$/i })
        .click()
      // The link also carries hidden "PRN or PERN number" text, so match on target + text.
      const result = page
        .locator('main a[href*="selected-prn"]')
        .filter({ hasText: number })
      await expect(result).toHaveCount(1)
      await snap(`Search for ${number}`)
      await result.click()
      await expect(page).toHaveURL(/selected-prn\//)
      const note = (await page.locator('main h1').first().innerText()).includes(
        'Export'
      )
        ? 'PERN'
        : 'PRN'
      await pages.prn.acceptLink(page).click()
      let year = C
      if (page.url().includes('choose-acceptance-year')) {
        year = C + 1
        await pages.chooseAcceptanceYear.radio(page, year).check()
        await snap('Which year')
        await pages.chooseAcceptanceYear.continue(page).click()
      }
      await expect(pages.acceptConfirm.question(page)).toContainText(
        `towards your ${year} recycling obligations`
      )
      await snap('Are you sure')
      await pages.acceptConfirm.yes(page).click()
      await expect(pages.accepted.banner(page)).toContainText(
        copy.accepted({
          flagOn: multiYear,
          note,
          year,
          tonnes: 0,
          material: ''
        }).banner
      )
      await snap('Accepted')
      await expectAudit(prnDb, number, {
        status: STATUS.ACCEPTED,
        year: multiYear ? year : null
      })
      for (const y of years) {
        const after = await totals(page, y, multiYear)
        expectObligationsChange(before[y], after, {
          label: `${y} after accepting ${number} into ${year}`,
          material,
          accepted: y === year ? tonnes : 0,
          awaiting: tonnes,
          count: 1
        })
        await snap(`Manage your ${y} recycling obligations after accepting`)
      }
      await expectSearchStatus(page, number, 'ACCEPTED')
    }
  },
  {
    id: 'TST-21',
    title: 'Material pages for the current and future year',
    stories: 'MO-382, MO-449',
    scope: { tst: true, local: ['S1', 'S2'] },
    async run({ page, snap, multiYear }) {
      for (const year of multiYear ? [C, C + 1] : [C]) {
        await openYear(page, year, multiYear)
        const grid = await pages.obligations.readGrid(page)
        const slugs = await page
          .locator('main a[href*="/manage-your-recycling-obligations/"]')
          .evaluateAll((links) => [
            ...new Set(
              links.map((a) => a.getAttribute('href').split('/').pop())
            )
          ])
        expect(slugs.length, `${year} material links`).toBeGreaterThan(0)
        for (const slug of slugs) {
          // The selected year is held in session, so the material page is for `year`.
          await page.goto(`${pages.obligations.path}/${slug}`)
          const h1 = clean(await page.locator('main h1').first().innerText())
          if (multiYear) {
            expect
              .soft(h1, `${year} ${slug} heading`)
              .toMatch(new RegExp(`^Your ${year} recycling obligation for `))
          } else {
            expect.soft(h1, `${slug} heading`).toContain(String(year))
          }
        }
        // Glass: the breakdown totals match the Glass row on the obligations page, for this year.
        await page.goto(`${pages.obligations.path}/Glass`)
        expect
          .soft(await mainText(page))
          .toContain(`material recycling targets for ${year} are set`)
        const glass = await pages.obligations.readGrid(page)
        for (const col of ['awaiting', 'accepted']) {
          expect
            .soft(
              num(glass.Totals && glass.Totals[col]),
              `${year} glass ${col}`
            )
            .toBe(num(grid.Glass && grid.Glass[col]))
        }
        await snap(`Your ${year} recycling obligation for glass`)
      }
    }
  },
  // ------------------------------------------------------------------------------------- local only
  {
    id: 'LOC-02',
    title: 'December Waste tags on the accept/reject and search lists',
    stories: 'MO-306, MO-311',
    scope: { local: ['S1', 'S2'] },
    async run({ page, snap }) {
      const expected = Object.fromEntries(
        db
          .listPrns(ORG_ID)
          .filter((p) => Number(p.PrnStatusId) === rules.AWAITING)
          .map((p) => [p.PrnNumber, rules.expectedFor(p, NOW)])
      )
      for (const [label, listPath, suffix] of [
        ['Accept or reject list', pages.prnList.path, true],
        ['Search', pages.search.path, false]
      ]) {
        const rows = await pages.readListRows(page, listPath)
        for (const r of rows) {
          const e = expected[r.num]
          if (!e) continue
          expect
            .soft(r.flash, `${label}: ${r.num}`)
            .toBe(e.flash ? copy.flashText(e.years, { list: suffix }) : '')
        }
        await page.goto(listPath)
        await snap(`${label}: tags`)
      }
    }
  },
  {
    id: 'LOC-04',
    title: 'December Waste tag on the PRN page and its PDF',
    stories: 'MO-308',
    scope: { local: ['S1'] },
    async run({ page, snap, evidence }) {
      const p = noteById(`MYDW-${TAG}-PRN-DW-DEC`)
      test.skip(!p, 'seeded December PRN missing: run stack.js --seed')
      const e = rules.expectedFor(p, NOW)
      await page.goto(pages.prn.path(p.ExternalId.toLowerCase()))
      await expect(page.locator('main')).toContainText(
        copy.decemberWarning('PRN', Number(p.ObligationYear))
      )
      await expect(
        page.getByText(copy.flashText(e.years, { list: false }))
      ).toBeVisible()
      await snap('PRN page with tag')
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page
          .getByRole('button', {
            name: /download this awaiting acceptance prn/i
          })
          .click()
      ])
      if (evidence)
        await download.saveAs(path.join(evidence, `${p.PrnNumber}.pdf`))
      expect(
        await pdfText(page, 'selected-prn', p.ExternalId.toLowerCase()),
        'PDF'
      ).toContain(copy.flashText(e.years, { list: false }))
    }
  },
  ...[
    {
      id: 'LOC-06',
      note: 'PRN',
      scenario: 'S1',
      accept: ORG_TYPE === 'DRP' ? 1 : 0
    },
    { id: 'LOC-08', note: 'PERN', scenario: 'S2', accept: 1 }
  ].map((c) => ({
    id: c.id,
    title: `Choose which year to accept a December Waste ${c.note} into`,
    stories: 'MO-330, MO-331, MO-332, MO-309, MO-310, MO-329, audit',
    scope: { local: [c.scenario] },
    mutates: true,
    async run({ page, snap, prnDb }) {
      const p = noteById(`MYDW-${TAG}-${c.note}-DW-DEC`)
      test.skip(!p, 'seeded December note missing: run stack.js --seed')
      const e = rules.expectedFor(p, NOW)
      const year = C + c.accept
      const other = c.accept ? C : C + 1
      const t = p.TonnageValue
      // Scope: a December Waste note shows as awaiting in both years until it is accepted into one.
      const before = await totals(page, year, true)
      const beforeOther = await totals(page, other, true)
      expect
        .soft(before.awaiting, `${year} awaiting includes ${t}t`)
        .toBeGreaterThanOrEqual(t)
      expect
        .soft(beforeOther.awaiting, `${other} awaiting includes ${t}t`)
        .toBeGreaterThanOrEqual(t)
      await page.goto(pages.prn.path(p.ExternalId.toLowerCase()))
      await expect(page.locator('main h1').first()).toHaveText(
        copy.noteHeading(c.note)
      )
      await pages.prn.acceptLink(page).click()
      await expect(pages.chooseAcceptanceYear.heading(page)).toHaveText(
        copy.yearQuestion(c.note)
      )
      expect(
        await pages.chooseAcceptanceYear
          .radios(page)
          .evaluateAll((r) => r.map((x) => Number(x.value)))
      ).toEqual(e.years)
      await snap('Which year')
      await pages.chooseAcceptanceYear.continue(page).click()
      await expect(page.locator('.govuk-error-summary')).toContainText(
        'Select a year'
      )
      await pages.chooseAcceptanceYear.radio(page, year).check()
      await pages.chooseAcceptanceYear.continue(page).click()
      const cf = copy.confirm({
        flagOn: true,
        note: c.note,
        year,
        tonnes: p.TonnageValue,
        material: ''
      })
      await expectConfirmHeading(page, c.note, year, cf)
      await snap(`Are you sure (${year})`)
      await pages.acceptConfirm.yes(page).click()
      const a = copy.accepted({
        flagOn: true,
        note: c.note,
        year,
        tonnes: p.TonnageValue,
        material: ''
      })
      await expect(pages.accepted.banner(page)).toContainText(a.banner)
      await expect.soft(page.getByText(a.acceptedTowards)).toBeVisible()
      await snap('Accepted')
      await expectAudit(prnDb, p.PrnNumber, { status: STATUS.ACCEPTED, year })
      // The last year chosen on "Choose a year" was `other`; progress should show the year accepted into (K3).
      await pages.accepted.progressLink(page).click()
      await expect
        .soft(
          page.locator('main h1').first(),
          'View recycling obligations progress'
        )
        .toHaveText(new RegExp(`Manage your ${year} recycling obligations`))
      await snap('View recycling obligations progress')
      const after = await totals(page, year, true)
      expectObligationsChange(before, after, {
        label: `${year} (accepted into)`,
        material: p.MaterialName,
        accepted: t,
        awaiting: t,
        count: 1
      })
      await snap(`Manage your ${year} recycling obligations after accepting`)
      const afterOther = await totals(page, other, true)
      expectObligationsChange(beforeOther, afterOther, {
        label: `${other} (other year)`,
        material: p.MaterialName,
        accepted: 0,
        awaiting: t,
        count: 1
      })
      await snap(`Manage your ${other} recycling obligations after accepting`)
    }
  })),
  ...[
    { id: 'LOC-21', note: 'PRN', scenario: 'S1' },
    { id: 'LOC-22', note: 'PERN', scenario: 'S2' }
  ].map((c) => ({
    id: c.id,
    title: `Reject a December Waste ${c.note}`,
    stories: 'MO-306, MO-329, regression, audit',
    scope: { local: [c.scenario] },
    mutates: true,
    async run({ page, snap, prnDb }) {
      const p = noteById(`MYDW-${TAG}-${c.note}-DW-DEC`)
      test.skip(!p, 'seeded December note missing: run stack.js --seed')
      expect(rules.expectedFor(p, NOW).choiceOfYear, 'two-year note').toBe(true)
      const t = p.TonnageValue
      // Awaiting in both years until actioned, so a reject removes it from both.
      const before = {
        [C]: await totals(page, C, true),
        [C + 1]: await totals(page, C + 1, true)
      }
      await page.goto(pages.prn.path(p.ExternalId.toLowerCase()))
      await pages.prn.rejectLink(page).click()
      await expect(pages.reject.question(page)).toHaveText(
        `Reject this ${c.note}?`
      )
      await snap('Reject confirmation')
      await pages.reject.yes(page).click()
      await expect(page.locator('main')).toContainText(`${c.note} rejected.`)
      await snap('Rejected')
      await expectAudit(prnDb, p.PrnNumber, { status: STATUS.REJECTED })
      await expectRejected(page, snap, p.PrnNumber)
      for (const year of [C, C + 1]) {
        const after = await totals(page, year, true)
        expectObligationsChange(before[year], after, {
          label: `${year} after rejecting ${p.PrnNumber}`,
          material: p.MaterialName,
          accepted: 0,
          awaiting: t,
          count: 1
        })
        await snap(`Manage your ${year} recycling obligations after rejecting`)
      }
    }
  })),
  {
    id: 'LOC-09',
    title: 'Year choice still offered at the last second of January',
    stories: 'MO-330',
    scope: { local: ['S2'] },
    async run({ page, snap }) {
      const p = noteById(`MYDW-${TAG}-PRN-DW-JAN`)
      test.skip(!p, 'seeded January PRN missing')
      await page.goto(pages.prn.path(p.ExternalId.toLowerCase()))
      await expect(
        page.getByText(copy.flashText([C, C + 1], { list: false }))
      ).toBeVisible()
      await pages.prn.acceptLink(page).click()
      expect(
        await pages.chooseAcceptanceYear
          .radios(page)
          .evaluateAll((r) => r.map((x) => Number(x.value)))
      ).toEqual([C, C + 1])
      await snap('Which year (31 January)')
    }
  },
  {
    id: 'LOC-10',
    title: 'No year choice after the window',
    stories: 'MO-330, MO-448',
    scope: { local: ['S3'] },
    async run({ page, snap }) {
      const p = noteById(`MYDW-${TAG}-PRN-DW-DEC`)
      test.skip(!p, 'seeded December PRN missing')
      await page.goto(pages.prn.path(p.ExternalId.toLowerCase()))
      await pages.prn.acceptLink(page).click()
      await expect(page).toHaveURL(/accept-prn\//)
      await expect(pages.acceptConfirm.question(page)).toContainText(
        `towards your ${C} recycling obligations`
      )
      await snap('Straight to confirmation')
    }
  },
  {
    id: 'LOC-11',
    title: 'Multi-select checkboxes follow the year rules',
    stories: 'MO-307',
    scope: { local: ['S1'] },
    async run({ page, snap }) {
      const byNumber = Object.fromEntries(
        db.listPrns(ORG_ID).map((p) => [p.PrnNumber, rules.expectedFor(p, NOW)])
      )
      const rows = await listRows(page)
      for (const r of rows) {
        if (byNumber[r.num]) {
          expect
            .soft(r.cb, `checkbox on ${r.num}`)
            .toBe(byNumber[r.num].bulkCheckbox)
        }
      }
      await page.goto(pages.prnList.path)
      await expect(pages.prnList.acceptSelected(page)).toBeVisible()
      await snap('Accept or reject list')
    }
  },
  {
    id: 'LOC-12',
    title: 'Accept selected button hidden when nothing can be selected',
    stories: 'MO-307',
    scope: { local: ['S1'] },
    mutates: true,
    async run({ page, snap }) {
      const single = db
        .listPrns(ORG_ID)
        .filter((p) => rules.expectedFor(p, NOW).bulkCheckbox)
        .map((p) => p.Id)
      if (single.length) {
        db.sql(
          `UPDATE Prn SET PrnStatusId=1 WHERE Id IN (${single.join(',')});`
        )
      }
      await page.goto(pages.prnList.path)
      await expect(pages.prnList.checkboxes(page)).toHaveCount(0)
      await expect(pages.prnList.acceptSelected(page)).toHaveCount(0)
      await snap('Only two-year notes awaiting')
    }
  },
  {
    id: 'LOC-14',
    title: 'December Waste details box only when expected',
    stories: 'MO-328',
    scope: { local: ['S1', 'S3'] },
    mutates: true,
    async run({ page, snap }) {
      await openYear(page, C, true)
      const current = await pages.obligations.readHowToMeet(page)
      expect.soft(current.details, `no details box for ${C}`).toBeNull()
      await snap(`${C} page`)
      if (!inWindow()) {
        await openYear(page, C + 1, true)
        const future = await pages.obligations.readHowToMeet(page)
        expect
          .soft(
            future.details,
            `no details box for ${C + 1} outside the window`
          )
          .toBeNull()
        await snap(`${C + 1} page`)
        return
      }
      // Step 3: with no two-year December Waste note awaiting, no details box for C+1.
      const twoYear = db
        .listPrns(ORG_ID)
        .filter((p) => rules.expectedFor(p, NOW).choiceOfYear)
        .map((p) => p.Id)
      if (twoYear.length) {
        db.sql(
          `UPDATE Prn SET PrnStatusId=1 WHERE Id IN (${twoYear.join(',')});`
        )
      }
      await openYear(page, C + 1, true)
      expect
        .soft(
          (await pages.obligations.readHowToMeet(page)).details,
          'no details box without a two-year December Waste note'
        )
        .toBeNull()
      await snap(`${C + 1} page, no two-year notes awaiting`)
    }
  },
  {
    id: 'LOC-18',
    title: 'Every awaiting note follows the December Waste year rules',
    stories: 'MO-330, MO-307, MO-306, MO-448, MO-27',
    scope: { local: ['S1', 'S2', 'S3', 'S4'] },
    async run({ page, snap }) {
      const ui = Object.fromEntries(
        (await listRows(page)).map((r) => [r.num, r])
      )
      for (const p of db.listPrns(ORG_ID)) {
        if (Number(p.PrnStatusId) !== rules.AWAITING) continue
        const e = rules.expectedFor(p, NOW)
        await page.goto(pages.prn.path(p.ExternalId.toLowerCase()))
        const canAccept = (await pages.prn.acceptLink(page).count()) > 0
        expect.soft(canAccept, `${p.PrnNumber} actionable`).toBe(e.actionable)
        expect
          .soft(
            !!(ui[p.PrnNumber] && ui[p.PrnNumber].cb),
            `${p.PrnNumber} checkbox`
          )
          .toBe(e.bulkCheckbox)
        if (!canAccept) continue
        await pages.prn.acceptLink(page).click()
        // Wait for whichever page Accept leads to before reading it.
        await expect(
          pages.chooseAcceptanceYear
            .heading(page)
            .or(pages.acceptConfirm.question(page))
        ).toBeVisible()
        const years = page.url().includes('choose-acceptance-year')
          ? await pages.chooseAcceptanceYear
              .radios(page)
              .evaluateAll((r) => r.map((x) => Number(x.value)))
          : [
              Number(
                ((await pages.acceptConfirm.question(page).innerText()).match(
                  /your (\d{4})/
                ) || [])[1]
              )
            ]
        expect.soft(years, `${p.PrnNumber} years`).toEqual(e.years)
      }
      await page.goto(pages.prnList.path)
      await snap('Accept or reject list')
    }
  },
  {
    id: 'LOC-15',
    title: '"How to meet" for the current year with no obligations calculated',
    stories: 'MO-449, MO-394',
    scope: { local: ['S3'] },
    async run({ page, snap }) {
      await openYear(page, C, true)
      const calculated = await isCalculated(page, C)
      expect(calculated, `${C} not calculated yet`).toBe(false)
      expect
        .soft((await pages.obligations.readHowToMeet(page)).lines)
        .toEqual(copy.howToMeet({ flagOn: true, calculated, year: C }))
      await snap(`Manage your ${C} recycling obligations`)
    }
  },
  {
    id: 'LOC-16',
    title: 'Feature flag off: ShowMultiYearObligations',
    stories: 'flag ACs of MO-326, 327, 330, 331, 335, 382, 393, 394, 435, 449',
    scope: { local: ['S2'] },
    flagOff: 'MY',
    async run({ page, snap, multiYear }) {
      expect(multiYear, 'multi-year tile hidden').toBe(false)
      const t = copy.tile({ flagOn: false, orgType: ORG_TYPE, year: C })
      await page.goto('/report-data')
      await expect(page.getByRole('link', { name: t.link })).toBeVisible()
      await expect(pages.home.searchAllLink(page)).toHaveCount(0)
      await snap('Legacy tile')
      const res = await page.goto(pages.chooseYear.path)
      expect(res.status(), 'Choose a year page').toBe(404)
      await snap('Choose a year: not found')
      await page.goto(pages.obligations.path)
      await expect(pages.obligations.heading(page, C)).toBeVisible()
      expect.soft((await pages.obligations.readHowToMeet(page)).lines).toEqual(
        copy.howToMeet({
          flagOn: false,
          calculated: await isCalculated(page, C),
          year: C
        })
      )
      await snap(`Manage your ${C} recycling obligations (legacy)`)
      const found = await findNote(page, {
        note: 'PRN',
        dw: false,
        selectable: true
      })
      test.skip(!found, 'no awaiting standard PRN')
      await page.goto(pages.prn.path(found.id))
      await pages.prn.acceptLink(page).click()
      await expect(pages.acceptConfirm.question(page)).toHaveText(
        copy.confirm({
          flagOn: false,
          note: 'PRN',
          year: C,
          tonnes: 0,
          material: ''
        }).heading
      )
      await expect(page.locator('main')).toContainText('This will credit')
      await snap('Legacy confirm page (not accepted)')
      const dw = noteById(`MYDW-${TAG}-PRN-DW-DEC`)
      test.skip(!dw, 'seeded December PRN missing')
      await page.goto(pages.prn.path(dw.ExternalId.toLowerCase()))
      await pages.prn.acceptLink(page).click()
      await expect(page, 'no year page').toHaveURL(/accept-prn\//)
      await snap('December Waste PRN: straight to confirm')
    }
  },
  {
    id: 'LOC-17',
    title: 'Feature flag off: ShowDecemberWaste',
    stories: 'flag ACs of MO-306, 308, 309, 310, 311',
    scope: { local: ['S2'] },
    flagOff: 'DW',
    mutates: true,
    async run({ page, snap, multiYear }) {
      expect(DW_FLAG, 'ShowDecemberWaste off').toBe(false)
      for (const [label, listPath] of [
        ['Accept or reject list', pages.prnList.path],
        ['Search', pages.search.path]
      ]) {
        const rows = await pages.readListRows(page, listPath)
        expect
          .soft(
            rows.filter((r) => r.flash).map((r) => r.num),
            `${label}: tags`
          )
          .toEqual([])
        await page.goto(listPath)
        await expect
          .soft(
            page.locator('main table thead'),
            `${label}: December waste column`
          )
          .toContainText(/December waste/i)
        await snap(`${label}: no tags`)
      }
      const dw = noteById(`MYDW-${TAG}-PRN-DW-DEC`)
      test.skip(!dw, 'seeded December PRN missing')
      await page.goto(pages.prn.path(dw.ExternalId.toLowerCase()))
      await expect(page.locator('main')).toContainText(
        copy.decemberWarning('PRN', Number(dw.ObligationYear))
      )
      await expect(page.getByText(/Can be accepted towards/)).toHaveCount(0)
      await snap('December Waste PRN: warning, no tag')
      expect(
        await pdfText(page, 'selected-prn', dw.ExternalId.toLowerCase()),
        'PDF'
      ).not.toContain('Can be accepted towards')
      const found = await findNote(page, { dw: false, selectable: true })
      test.skip(!found, 'no awaiting single-year note')
      await page.goto(pages.prn.path(found.id))
      await pages.prn.acceptLink(page).click()
      await pages.acceptConfirm.yes(page).click()
      await expect(pages.accepted.banner(page)).toBeVisible()
      await expect(
        page.getByText(/Accepted towards \d{4} recycling obligations/)
      ).toHaveCount(0)
      await snap('Accepted: no "Accepted towards" line')
      await page.goto(pages.prn.path(found.id))
      await expect(
        page.getByText(/Accepted towards \d{4} recycling obligations/)
      ).toHaveCount(0)
      await snap('Accepted PRN page: no "Accepted towards" line')
    }
  }
]
/* eslint-enable playwright/no-standalone-expect */

// ---------------------------------------------------------------------------------------------- suite

const FLAG_OFF = MY_FLAG === false ? 'MY' : DW_FLAG === false ? 'DW' : null
const selected = CASE_DEFS.filter(
  (c) =>
    (CASES.has('all') || CASES.has(c.id)) &&
    (c.flagOff || null) === FLAG_OFF &&
    (LOCAL ? (c.scope.local || []).includes(SCENARIO) : !!c.scope.tst)
)

test.describe(`MY&DW E2E · ${ENV} · ${REGULATOR} ${ORG_TYPE} · ${SCENARIO}`, () => {
  test.skip(
    !RUN,
    'MY&DW harness env not set: run .claude/skills/mydw-e2e/runner.mjs'
  )

  let context
  let page
  let multiYear
  let prnDb

  test.beforeAll(async ({ browser }, testInfo) => {
    if (!RUN) return
    testInfo.setTimeout(330_000) // sign-in retries against a just-restarted frontend
    context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 900 }
    })
    page = await context.newPage()
    page.setDefaultNavigationTimeout(60_000)
    page.setDefaultTimeout(30_000)
    await signIn(page)
    multiYear = await flagOn(page)
    prnDb = await connectPrnDb(ENV)
  })

  test.afterAll(async () => {
    if (prnDb && prnDb.close) await prnDb.close()
    if (context) await context.close()
  })

  if (!RUN) {
    // eslint-disable-next-line playwright/expect-expect -- keeps the file listable when the harness env isn't set
    test('placeholder', () => {})

    return
  }

  for (const c of selected) {
    test(`${c.id} ${c.title} [${c.stories}]`, async ({
      screenshotRecorder
    }) => {
      const snap = (label) =>
        screenshotRecorder.capture(page, `${c.id} ${label}`)
      try {
        await c.run({
          page,
          snap,
          multiYear,
          prnDb,
          evidence: process.env.EVIDENCE_DIR
        })
      } finally {
        // eslint-disable-next-line playwright/no-conditional-in-test -- cleanup differs by environment, not the check
        if (LOCAL && c.mutates) db.restore()
        // tst has no snapshot: put the account's notes back to awaiting acceptance, as the runner does
        // before each account, so later accept/reject cases still have notes to act on.
        // eslint-disable-next-line playwright/no-conditional-in-test -- cleanup differs by environment, not the check
        if (!LOCAL && c.mutates && prnDb && prnDb.resetToAwaiting) {
          await prnDb.resetToAwaiting(ORG_IDS)
        }
      }
    })
  }
})
