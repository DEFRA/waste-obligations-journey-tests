'use strict'

const pages = require('../lib/pages')
const {
  signInStep,
  openObligations,
  gridLine,
  gridMaterial,
  prnIdByNumber,
  pickPrn,
  noun,
  commitGuard
} = require('./_common')

function target(ctx) {
  const number = pickPrn(ctx, 'dwAlt')
  const prn = ctx.db
    .listPrns(ctx.user.orgExternalId)
    .find((p) => p.PrnNumber === number)
  if (!prn) throw new Error(`${number} not found for ${ctx.user.orgName}`)
  return {
    number,
    prn,
    n: noun(prn),
    e: ctx.rules.expectedFor(prn, ctx.now),
    material: gridMaterial(prn.MaterialName)
  }
}

module.exports = {
  id: 'MYDW-07',
  title: 'Reject a PRN/PERN (--note PERN for a seeded PERN)',
  applies: (ctx) => {
    const t = target(ctx)
    return t.e.actionable
      ? true
      : `${t.number} is not actionable at this clock; pick another --prn (see --rules)`
  },
  preconditionsSummary: (ctx) => [
    `Note under test: ${ctx.rules.describe(target(ctx).prn, ctx.now)}.`
  ],
  buildSteps: async (ctx) => {
    const t = target(ctx)
    const year =
      Number(t.prn.ObligationYear) <= ctx.complianceYear
        ? Number(t.prn.ObligationYear)
        : ctx.complianceYear
    const state = {}
    return [
      signInStep('01'),
      {
        id: '02',
        title: `Record the ${year} grid`,
        action: async ({ page }) => {
          state.before = await openObligations(page, year)
          return gridLine(state.before, t.material)
        },
        expected: 'Baseline captured.'
      },
      {
        id: '03',
        title: `Open ${t.number} → Reject this ${t.n}`,
        hypothesis: 'H3',
        action: async ({ page }) => {
          state.id = await prnIdByNumber(page, t.number, ctx)
          await page.goto(pages.prn.path(state.id))
          await pages.prn.rejectLink(page).click()
          await pages.reject.question(page).waitFor()
          return (await page.locator('main').innerText()).replace(/\s+/g, ' ')
        },
        expected: `"Reject this ${t.n}?" / "This is permanent and cannot be undone." / "Yes, reject" and "No, go back". Browser title "Reject this ${t.n}". No year choice for rejection.`
      },
      {
        id: '04',
        title: '"No, go back"',
        action: async ({ page }) => {
          await pages.reject.noGoBack(page).click()
          await page.waitForLoadState('domcontentloaded')
          return `Landed on ${new URL(page.url()).pathname}`
        },
        expected: `Returns to the ${t.n} page; still AWAITING ACCEPTANCE.`
      },
      {
        id: '05',
        title: 'Reject → Yes, reject',
        action: async ({ page, ctx: c }) => {
          await pages.prn.rejectLink(page).click()
          if (c.dryRun) return commitGuard(c)
          await pages.reject.yes(page).click()
          await page.waitForLoadState('domcontentloaded')
          return (await page.locator('main').innerText())
            .replace(/\s+/g, ' ')
            .slice(0, 300)
        },
        expected: `Rejected confirmation page (rejected-prn/{id}): "${t.n} rejected.", status REJECTED; links back to accept/reject list and obligations.`
      },
      {
        id: '06',
        title: 'List and grid after rejection',
        action: async ({ page, ctx: c }) => {
          if (c.dryRun) return commitGuard(c)
          const listed = (await pages.readListRows(page)).filter(
            (r) => r.num === t.number
          ).length
          const after = await openObligations(page, year)
          const row = c.db
            .listPrns(c.user.orgExternalId)
            .find((p) => p.PrnNumber === t.number)
          return `still listed: ${listed > 0}; before ${gridLine(state.before, t.material)} → after ${gridLine(after, t.material)}; DB status ${row.PrnStatusId}, year ${row.ObligationYear}`
        },
        expected: `${t.n} no longer on any page of the accept/reject list; ${year} awaiting −${t.prn.TonnageValue} t, accepted unchanged; DB PrnStatusId 2 with ObligationYear unchanged (${t.prn.ObligationYear}).`
      }
    ]
  }
}
