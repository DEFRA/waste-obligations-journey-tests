'use strict'

const pages = require('../lib/pages')
const { signInStep, prnIdByNumber, DEFAULT_PRNS } = require('./_common')

// Regression with ShowMultiYearObligations and/or ShowDecemberWaste OFF (reference/flags-off.compose.yml).
// Read-only: stops at the confirmation page.

const on = (v) => String(v).toLowerCase() === 'true'

module.exports = {
  id: 'MYDW-09',
  title: 'Feature flags off — legacy behaviour',
  applies: (ctx) =>
    on(ctx.flags.ShowMultiYearObligations) && on(ctx.flags.ShowDecemberWaste)
      ? 'both flags are on — recreate the frontend with reference/flags-off.compose.yml first'
      : true,
  buildSteps: async (ctx) => {
    const myOff = !on(ctx.flags.ShowMultiYearObligations)
    const dwOff = !on(ctx.flags.ShowDecemberWaste)
    const dw = DEFAULT_PRNS[ctx.orgType].dw
    return [
      signInStep('01'),
      {
        id: '02',
        title: 'Obligations tile',
        action: async ({ page }) =>
          `legacy link: ${await pages.home.legacyObligationsLink(page).count()}; multi-year link: ${await pages.home.manageObligationsLink(page).count()}`,
        expected: myOff
          ? `Tile heading link "Manage your ${ctx.complianceYear} recycling obligations" → manage-your-recycling-obligations; no "Manage recycling obligations" / "Search all PRNs and PERNs" multi-year variant.`
          : 'Multi-year tile ("Manage recycling obligations") because ShowMultiYearObligations is on.'
      },
      {
        id: '03',
        title: 'Direct hit on choose-your-recycling-obligations-year',
        action: async ({ page }) => {
          const res = await page.goto(pages.chooseYear.path)
          return `HTTP ${res ? res.status() : '?'} — ${await page.title()}`
        },
        expected: myOff
          ? "HTTP 404 (feature-gated) with the service's page-not-found page."
          : '"Choose a year" page.'
      },
      {
        id: '04',
        title: 'Obligations page year',
        action: async ({ page }) => {
          await page.goto(pages.obligations.path)
          return (await page.locator('main h1').innerText()).trim()
        },
        expected: `"Manage your ${ctx.complianceYear} recycling obligations" (always the current compliance year when multi-year is off).`
      },
      {
        id: '05',
        title: `December Waste PRN ${dw} — list and PRN page`,
        action: async ({ page }) => {
          await page.goto(pages.prnList.path)
          const flash = await pages.prnList.flashTags(page).count()
          const id = await prnIdByNumber(page, dw, ctx)
          await page.goto(pages.prn.path(id))
          const tag = await page
            .getByText(
              /can be accepted towards|accepted towards \d{4} recycling obligations/i
            )
            .count()
          return `flash tags on list: ${flash}; tag on PRN page: ${tag}`
        },
        expected: dwOff
          ? 'No blue "Can be accepted towards…" tags anywhere. The "December waste" column and the December warning on the PRN page still show (not flag-gated).'
          : 'Blue tags may show (ShowDecemberWaste is on) subject to the Dec–Jan window.'
      },
      {
        id: '06',
        title: 'Accept the December Waste PRN',
        action: async ({ page }) => {
          await pages.prn.acceptLink(page).click()
          await page.waitForLoadState('domcontentloaded')
          return `${new URL(page.url()).pathname} — ${(await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 200)}`
        },
        expected: myOff
          ? `No year page. Legacy confirm copy "Accept this PRN towards your ${ctx.complianceYear} recycling obligations?" with inset "This will credit … tonnes towards your … recycling obligation." Do not click Yes (accepts into ${ctx.complianceYear}).`
          : 'Year page / multi-year confirm copy.'
      }
    ]
  }
}
