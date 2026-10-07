'use strict'

const fs = require('fs')
const path = require('path')
const pages = require('../lib/pages')
const { signInStep, openObligations } = require('./_common')

module.exports = {
  id: 'MYDW-02',
  title: 'Obligations page for a chosen year (--year, default C)',
  applies: (ctx) =>
    String(ctx.flags.ShowMultiYearObligations) === 'true'
      ? true
      : 'ShowMultiYearObligations is off (use MYDW-09)',
  preconditionsSummary: (ctx) => [`Year under test: ${ctx.year}.`],
  steps: [
    signInStep('01'),
    {
      id: '02',
      title: 'Choose the year and open the obligations page',
      action: async ({ page, ctx }) => {
        const grid = await openObligations(page, ctx.year)
        return `Totals: ${JSON.stringify(grid.Totals || {})}`
      },
      expected: ({ ctx }) =>
        `Heading "Manage your ${ctx.year} recycling obligations"; Producer/Regulator shown; "You have until 31 January ${ctx.year + 1} to meet your recycling obligations for ${ctx.year}." with an enforcement warning; "Number of PRNs and PERNs awaiting acceptance" count.`
    },
    {
      id: '03',
      title: 'Check the progress grid and glass breakdown',
      action: async ({ page }) => {
        const grid = await pages.obligations.readGrid(page)
        return Object.entries(grid)
          .map(
            ([k, v]) =>
              `${k}: ${v.toMeet}/${v.awaiting}/${v.accepted}/${v.outstanding}/${v.status}`
          )
          .join('; ')
      },
      expected: ({ ctx }) =>
        `Columns: obligation to meet / awaiting acceptance / accepted / outstanding / status. Awaiting and accepted tonnage reflect only PRNs whose obligation year is ${ctx.year}. Glass re-melt + remaining glass breakdown table present.`
    },
    {
      id: '04',
      title: 'Open a material drill-down (Glass)',
      action: async ({ page }) => {
        await pages.obligations.materialLink(page, 'Glass').click()
        await page.waitForLoadState('domcontentloaded')
        return (await page.locator('main h1').innerText()).trim()
      },
      expected: ({ ctx }) =>
        `"Your ${ctx.year} recycling obligation for glass" with ${ctx.year} figures matching the grid row. Watch the figures, not just the heading: the code read suggested the material controller may compute with the current compliance year (${ctx.complianceYear}).`
    },
    {
      id: '05',
      title: 'Back → "Accept or reject PRNs and PERNs"',
      action: async ({ page, ctx }) => {
        await page.goto(pages.obligations.path)
        await pages.obligations.heading(page, ctx.year).waitFor()
        await pages.obligations.acceptOrRejectLink(page).click()
        await pages.prnList.heading(page).waitFor()
        const rows = await page
          .locator('main table tbody tr:not(.december-waste-flash-row)')
          .count()
        return `${rows} PRN rows listed`
      },
      expected: ({ ctx }) =>
        `Accept/reject list opens. Decide whether it is scoped to ${ctx.year}: on the local stack it currently lists the same awaiting PRNs whichever year was chosen — record as NOTE/FAIL per the ticket's ACs.`
    },
    {
      id: '06',
      title: 'Download the PRN CSV for the year',
      action: async ({ page, ctx, cellDir }) => {
        await page.goto(pages.obligations.path)
        const linkText = (await pages.obligations.csvLink(page).innerText())
          .replace(/\s+/g, ' ')
          .trim()
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 20000 }),
          pages.obligations.csvLink(page).click()
        ])
        const file = path.join(
          cellDir,
          `prns-${ctx.year}-${download.suggestedFilename()}`
        )
        await download.saveAs(file)
        const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/)
        return `Link "${linkText}"; saved ${path.basename(file)} with ${lines.length - 1} data rows`
      },
      expected: ({ ctx }) =>
        `Link reads "Download a list of all PRNs and PERNs for ${ctx.year} (CSV)"; the CSV downloads and contains only ${ctx.year} PRNs/PERNs (open the saved file in the evidence folder to check).`
    }
  ]
}
