'use strict'

const { signIn } = require('../lib/session')
const pages = require('../lib/pages')

function signInStep(id = '01') {
  return {
    id,
    title: 'Sign in through the mock B2C picker',
    action: async ({ page, ctx }) => {
      await signIn(page, ctx.user.userId)
      return `Landed on ${new URL(page.url()).pathname}`
    },
    expected: ({ ctx }) =>
      `Account home for ${ctx.user.orgName.replace(/ \(\d+\)$/, '')} loads (home-self-managed for DRP, home-compliance-scheme for CS).`
  }
}

// Picks the year on "Choose a year" and returns the progress grid as a compact string.
async function openObligations(page, year) {
  await pages.chooseYear.choose(page, year)
  await pages.obligations.heading(page, year).waitFor({ timeout: 15000 })
  return pages.obligations.readGrid(page)
}

function gridLine(grid, material) {
  const row = grid[material]
  if (!row) return `${material}: (no row)`
  return `${material}: awaiting ${row.awaiting}, accepted ${row.accepted}, outstanding ${row.outstanding}, ${row.status}`
}

function totalsLine(grid) {
  return gridLine(grid, 'Totals')
}

// Material name on the obligations grid for a PRN MaterialName from the DB.
function gridMaterial(materialName) {
  if (/paper|fibre/i.test(materialName))
    return 'Paper, board or fibre-based composite material'
  if (/glass/i.test(materialName)) return 'Glass'
  if (/aluminium/i.test(materialName)) return 'Aluminium'
  return materialName
}

// PRN GUID from the DB (the list is paginated, so scraping it misses rows beyond page 1).
async function prnIdByNumber(page, prnNumber, ctx) {
  const row = ctx.db
    .listPrns(ctx.user.orgExternalId)
    .find((p) => p.PrnNumber === prnNumber)
  if (!row)
    throw new Error(`PRN ${prnNumber} not found for ${ctx.user.orgName}`)
  return row.ExternalId.toLowerCase()
}

// Default PRNs per org, from compose/epr-prn-common-backend-migrations/seed.sql.
const DEFAULT_PRNS = {
  DRP: {
    dw: 'DP-PRN-010-RREPW',
    dwAlt: 'DP-PRN-008-RREPW',
    standard: 'DP-PRN-009-RREPW',
    dw2025: 'DP-PRN-002-NPWD-DEC',
    future: 'DP-PRN-005-RREPW'
  },
  CS: {
    dw: 'PRN-015-RREPW',
    dwAlt: 'PRN-014-RREPW',
    standard: 'PRN-003-RREPW',
    dw2025: 'PRN-002-NPWD-DEC',
    future: 'PRN-009-RREPW'
  }
}

// Picks the note under test. --prn wins; --note PERN uses the skill-seeded PERNs (gather.js --seed); for PRNs the
// seeded December-issued PRN is preferred for 'dw' when present (so the blue tag can show), else seed.sql rows.
const SEEDED = {
  PRN: { dw: 'PRN-DW-DEC', dwAlt: 'PRN-DW-NOV', standard: null },
  PERN: { dw: 'PERN-DW-DEC', dwAlt: 'PERN-STD-2', standard: 'PERN-STD' }
}

function pickPrn(ctx, kind) {
  if (ctx.prnNumber) return ctx.prnNumber
  const tag = ctx.orgType === 'DRP' ? 'DP' : 'CS'
  const all = ctx.db.listPrns(ctx.user.orgExternalId).map((p) => p.PrnNumber)
  const seeded = SEEDED[ctx.noteType][kind]
    ? `MYDW-${tag}-${SEEDED[ctx.noteType][kind]}`
    : null
  if (ctx.noteType === 'PERN') {
    if (!seeded || !all.includes(seeded))
      throw new Error(
        `No seeded PERN for '${kind}' — run: node scripts/gather.js --seed`
      )
    return seeded
  }
  if (kind === 'dw' && seeded && all.includes(seeded)) return seeded
  return DEFAULT_PRNS[ctx.orgType][kind]
}

function noun(prn) {
  return prn.IsExport === true || prn.IsExport === 1 ? 'PERN' : 'PRN'
}

function commitGuard(ctx) {
  return ctx.dryRun ? 'DRY RUN — not clicked. ' : ''
}

module.exports = {
  signInStep,
  openObligations,
  gridLine,
  totalsLine,
  gridMaterial,
  prnIdByNumber,
  DEFAULT_PRNS,
  pickPrn,
  noun,
  commitGuard
}
