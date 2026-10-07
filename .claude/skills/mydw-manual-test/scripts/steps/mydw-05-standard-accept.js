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

// A PRN with exactly one available year (standard PRN for C, or a 2025 December Waste PRN) skips the year page.

function target(ctx) {
  const number = pickPrn(ctx, 'standard')
  const prn = ctx.db
    .listPrns(ctx.user.orgExternalId)
    .find((p) => p.PrnNumber === number)
  if (!prn) throw new Error(`${number} not found for ${ctx.user.orgName}`)
  const e = ctx.rules.expectedFor(prn, ctx.now)
  return {
    number,
    prn,
    e,
    n: noun(prn),
    year: e.years[0],
    material: gridMaterial(prn.MaterialName)
  }
}

module.exports = {
  id: 'MYDW-05',
  title:
    'Single-year PRN/PERN — accept without a year choice (--note PERN for the seeded PERN)',
  applies: (ctx) => {
    const t = target(ctx)
    if (t.e.years.length !== 1)
      return `${t.number} offers ${t.e.years.length} years at this clock — pick a single-year PRN with --prn (see --rules)`
    return true
  },
  preconditionsSummary: (ctx) => [
    `Note under test: ${ctx.rules.describe(target(ctx).prn, ctx.now)}.`
  ],
  buildSteps: async (ctx) => {
    const t = target(ctx)
    const state = {}
    return [
      signInStep('01'),
      {
        id: '02',
        title: `Record the ${t.year} grid`,
        action: async ({ page }) => {
          state.before = await openObligations(page, t.year)
          return gridLine(state.before, t.material)
        },
        expected: 'Baseline captured.'
      },
      {
        id: '03',
        title: `Open ${t.number} and click Accept this ${t.n}`,
        action: async ({ page }) => {
          const id = await prnIdByNumber(page, t.number, ctx)
          await page.goto(pages.prn.path(id))
          await pages.prn.acceptLink(page).click()
          await page.waitForLoadState('domcontentloaded')
          const q = (
            await pages.acceptConfirm
              .question(page)
              .innerText()
              .catch(() => '')
          ).trim()
          return `Landed on ${new URL(page.url()).pathname}; question "${q}"; title "${(await page.title()).split(' - ')[0]}"`
        },
        expected: `Goes straight to /accept-prn/{id} (no year page): "Are you sure you want to accept this ${t.n} towards your ${t.year} recycling obligations?"${t.n === 'PERN' ? ' Known (K12): PERN shows the legacy "Accept this PERN towards your Y recycling obligations?" heading and browser title "Accept this PRN".' : ''}`
      },
      {
        id: '04',
        title: 'Yes, accept',
        action: async ({ page, ctx: c }) => {
          if (c.dryRun) return commitGuard(c)
          await pages.acceptConfirm.yes(page).click()
          await pages.accepted.bannerTitle(page).waitFor()
          return (await pages.accepted.banner(page).innerText()).replace(
            /\s+/g,
            ' '
          )
        },
        expected: `Success banner "You accepted this ${t.n} towards your ${t.year} recycling obligations"; page shows "${t.n === 'PERN' ? 'Packaging Waste Export Recycling Note' : 'Packaging Waste Recycling Note'}".`
      },
      {
        id: '05',
        title: `Verify the ${t.year} grid`,
        action: async ({ page, ctx: c }) => {
          if (c.dryRun) return commitGuard(c)
          const after = await openObligations(page, t.year)
          return `before ${gridLine(state.before, t.material)} → after ${gridLine(after, t.material)}`
        },
        expected: `${t.material}: accepted +${t.prn.TonnageValue} t, awaiting −${t.prn.TonnageValue} t.`
      }
    ]
  }
}
