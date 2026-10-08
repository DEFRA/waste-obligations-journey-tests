'use strict'

const pages = require('../lib/pages')
const { signInStep } = require('./_common')

module.exports = {
  id: 'MYDW-01',
  title: 'Dashboard tile and year selection',
  applies: (ctx) =>
    String(ctx.flags.ShowMultiYearObligations) === 'true'
      ? true
      : 'ShowMultiYearObligations is off (use MYDW-09)',
  steps: [
    signInStep('01'),
    {
      id: '02',
      title: 'Read the "Manage recycling obligations" tile',
      hypothesis: 'H1',
      observe:
        'Does the "by year" wording register, or does the certificate/statement deadline dominate?',
      action: async ({ page }) => {
        const link = pages.home.manageObligationsLink(page)
        await link.scrollIntoViewIfNeeded()
        const text = await page.locator('main').innerText()
        const m = text.match(
          /Manage recycling obligations\s+([\s\S]*?)Search all PRNs and PERNs/
        )
        return m ? m[1].replace(/\s+/g, ' ').trim() : 'tile text not found'
      },
      expected: ({ ctx }) =>
        `Tile heading link "Manage recycling obligations"; body "View or manage your recycling obligations by year (includes PRNs and PERNs)."; deadline line "An approved or delegated person must submit your ${ctx.complianceYear} ${ctx.user.submissionName} on or before 31 January ${ctx.complianceYear + 1}."; link "Search all PRNs and PERNs".`
    },
    {
      id: '03',
      title: 'Open the tile → Choose a year',
      hypothesis: 'H2',
      observe:
        'Does the user understand why next year is offered? Note there is no hint text on this page.',
      action: async ({ page }) => {
        await pages.home.manageObligationsLink(page).click()
        await pages.chooseYear.heading(page).waitFor()
        const years = await pages.chooseYear
          .radios(page)
          .evaluateAll((r) => r.map((x) => x.value))
        return `Radios offered: ${years.join(', ')}`
      },
      expected: ({ ctx }) =>
        `"Choose a year" page (/report-data/choose-your-recycling-obligations-year) with radios ${ctx.rules.yearOptions(ctx.now).join(', ')} (newest first, down to 2025), none pre-selected, and a Continue button.`
    },
    {
      id: '04',
      title: 'Continue without choosing a year',
      action: async ({ page }) => {
        await pages.chooseYear.continue(page).click()
        await pages.chooseYear.errorSummary(page).waitFor({ timeout: 10000 })
        return (await pages.chooseYear.errorSummary(page).innerText()).replace(
          /\s+/g,
          ' '
        )
      },
      expected:
        'GOV.UK error summary "There is a problem — Select a year", linked to the first radio; inline error on the fieldset.'
    },
    {
      id: '05',
      title: 'Choose next year (C+1)',
      hypothesis: 'H2',
      action: async ({ page, ctx }) => {
        await pages.chooseYear.choose(page, ctx.complianceYear + 1)
        await pages.obligations.heading(page, ctx.complianceYear + 1).waitFor()
        const body = (await page.locator('main').innerText()).replace(
          /\s+/g,
          ' '
        )
        const calc = body.match(
          /Your \d{4} recycling obligations have not been calculated yet[^.]*\./
        )
        const dw = /December waste PRN or PERN/i.test(body)
        return `${calc ? calc[0] : 'no "not calculated yet" copy'}; December waste explainer ${dw ? 'present' : 'absent'}`
      },
      expected: ({ ctx }) =>
        `"Manage your ${ctx.complianceYear + 1} recycling obligations"; deadline "You have until 31 January ${ctx.complianceYear + 2}…"; grid shows "Not available yet"/NO DATA YET with any tonnage awaiting; copy explains obligations are not calculated yet and (when the org holds December waste PRNs) that they can be accepted towards ${ctx.complianceYear} or ${ctx.complianceYear + 1}.`
    },
    {
      id: '06',
      title: 'Choose the current year (C)',
      action: async ({ page, ctx }) => {
        await pages.chooseYear.choose(page, ctx.complianceYear)
        await pages.obligations.heading(page, ctx.complianceYear).waitFor()
        const grid = await pages.obligations.readGrid(page)
        return `Totals: ${JSON.stringify(grid.Totals || {})}`
      },
      expected: ({ ctx }) =>
        `"Manage your ${ctx.complianceYear} recycling obligations"; grid shows calculated obligations where POM data exists; "What to do next" lists "Accept or reject PRNs and PERNs for ${ctx.complianceYear}", search, CSV download, and the ${ctx.user.submissionName} link.`
    },
    {
      id: '07',
      title: 'Choose the earliest year (2025)',
      action: async ({ page }) => {
        await pages.chooseYear.choose(page, 2025)
        return `${new URL(page.url()).pathname} — "${(await page.locator('main h1').innerText()).trim()}"`
      },
      expected: ({ ctx }) =>
        `Historic-year page "Your ${ctx.user.submissionName} record for 2025": explains 2025 records were processed outside the service, gives the regulator contact email, and offers "Search PRNs and PERNs" and "Download a list of your PRNs and PERNs for 2025 (CSV)". No accept/reject actions.`
    },
    {
      id: '08',
      title: 'Return home → "Search all PRNs and PERNs"',
      action: async ({ page }) => {
        await page.goto('/report-data')
        await pages.home.searchAllLink(page).click()
        await pages.search.heading(page).waitFor()
      },
      expected:
        '"Search PRNs and PERNs" page lists PRNs across all years, with a "December waste" column and a "December waste (yes to no)" sort option.'
    }
  ]
}
