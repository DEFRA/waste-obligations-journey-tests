'use strict'

const pages = require('../lib/pages')
const {
  signInStep,
  openObligations,
  totalsLine,
  commitGuard
} = require('./_common')

// Bulk flow: list (select) → "Review your selection before accepting" → Accept (commits) → accepted-prns.
// Bulk accept always sends the current compliance year; two-year December Waste PRNs must not be selectable.

async function selectable(page) {
  return page
    .locator(
      'main table tbody tr:has(input[type=checkbox]) a[href*="selected-prn"]'
    )
    .evaluateAll((a) =>
      a.map((x) => x.innerText.replace(/PRN or PERN number/i, '').trim())
    )
}

async function check(page, numbers) {
  for (const n of numbers) await pages.prnList.checkbox(page, n).check()
  await pages.prnList.acceptSelected(page).click()
  await pages.bulk.reviewHeading(page).waitFor()
}

module.exports = {
  id: 'MYDW-06',
  title: 'Bulk accept (select, review, remove, accept)',
  preconditionsSummary: () => [
    'PRN data restored to snapshot (gather.js --restore); at least two PRNs with checkboxes.'
  ],
  buildSteps: async (ctx) => {
    const state = {}
    return [
      signInStep('01'),
      {
        id: '02',
        title: `Record the ${ctx.complianceYear} totals and open the list`,
        action: async ({ page }) => {
          state.before = await openObligations(page, ctx.complianceYear)
          await page.goto(pages.prnList.path)
          state.sel = await selectable(page)
          const twoYear = ctx.db
            .listPrns(ctx.user.orgExternalId)
            .filter((p) => ctx.rules.expectedFor(p, ctx.now).choiceOfYear)
            .map((p) => p.PrnNumber)
          const leaked = twoYear.filter((n) => state.sel.includes(n))
          return `${totalsLine(state.before)} | selectable: ${state.sel.join(', ')} | two-year DW selectable: ${leaked.join(', ') || 'none'}`
        },
        expected:
          'Only single-year PRNs have checkboxes; no December Waste PRN that offers a choice of year is selectable (it would be silently accepted into the current year).'
      },
      {
        id: '03',
        title: 'Accept selected with nothing selected',
        action: async ({ page }) => {
          await pages.prnList.acceptSelected(page).click()
          await page.waitForLoadState('domcontentloaded')
          const err = await page
            .locator('.govuk-error-summary')
            .innerText()
            .catch(() => '')
          return err
            ? err.replace(/\s+/g, ' ')
            : `No error summary; URL ${new URL(page.url()).pathname}`
        },
        expected:
          'Validation error asking the user to select at least one PRN or PERN; stays on the list.'
      },
      {
        id: '04',
        title: 'Select two PRNs → Review your selection',
        hypothesis: 'H6',
        observe:
          'Does the user understand this is a review step, and that the next button commits?',
        action: async ({ page }) => {
          await page.goto(pages.prnList.path)
          const notes = new Map(
            ctx.db
              .listPrns(ctx.user.orgExternalId)
              .map((x) => [x.PrnNumber, x.IsExport ? 'PERN' : 'PRN'])
          )
          const pern = state.sel.find((x) => notes.get(x) === 'PERN')
          const prn = state.sel.find((x) => notes.get(x) === 'PRN')
          state.picked = pern && prn ? [prn, pern] : state.sel.slice(0, 2)
          state.mixed = !!(pern && prn)
          if (state.picked.length < 2)
            throw new Error(`Need 2 selectable PRNs, found ${state.sel.length}`)
          await check(page, state.picked)
          return (await page.locator('main').innerText())
            .replace(/\s+/g, ' ')
            .slice(0, 400)
        },
        expected: ({ ctx: c }) =>
          `Picks one PRN and one PERN when both are selectable (run --seed for PERNs). "Review your selection before accepting": one table per material with PRN number / Date issued / Issued by / Tonnage / "Remove from selection" and a Total; "Now accept — Accepting them will credit the tonnage towards your obligation." and an "Accept" button. Note: no year is stated anywhere (bulk always uses ${c.complianceYear}).`
      },
      {
        id: '05',
        title: 'Remove one PRN from the selection',
        hypothesis: 'H6',
        action: async ({ page }) => {
          await pages.bulk.removeLinks(page).first().click()
          await page.waitForLoadState('domcontentloaded')
          const banner = await page
            .locator('.govuk-notification-banner')
            .innerText()
            .catch(() => '')
          return `${await pages.bulk.removeLinks(page).count()} left; banner: ${banner.replace(/\s+/g, ' ') || 'none'}`
        },
        expected:
          'Stays on the review page with a success banner "You have removed PRN <number>…"; one PRN remains.'
      },
      {
        id: '06',
        title: 'Remove the last PRN',
        hypothesis: 'H6',
        action: async ({ page }) => {
          await pages.bulk.removeLinks(page).first().click()
          await page.waitForLoadState('domcontentloaded')
          return (await page.locator('main').innerText())
            .replace(/\s+/g, ' ')
            .slice(0, 300)
        },
        expected:
          'Empty state: "You have removed all the selected PRNs…" with a button back to "Accept or reject PRNs and PERNs". Recovery is clear.'
      },
      {
        id: '07',
        title: 'Reselect two PRNs and Accept',
        action: async ({ page, ctx: c }) => {
          await page.goto(pages.prnList.path)
          await check(page, state.picked)
          if (c.dryRun) return commitGuard(c)
          await pages.bulk.accept(page).click()
          await page.waitForURL(/accepted-prns/)
          return (await pages.bulk.panelHeading(page).innerText()).trim()
        },
        expected: ({ ctx: c }) =>
          `Clicking "Accept" on the review page commits immediately (no second confirmation). Panel "You’ve accepted 2 PRNs towards your ${c.complianceYear} recycling obligations" — or, when one PRN and one PERN were picked (seeded PERNs present), the mixed variant "You’ve accepted 2 PRNs and PERNs towards your ${c.complianceYear} recycling obligations" (PERN-only: "You’ve accepted 2 PERNs…") — a tonnage tile per material, link "View recycling obligations progress".`
      },
      {
        id: '08',
        title: 'View recycling obligations progress',
        hypothesis: 'H5',
        action: async ({ page, ctx: c }) => {
          if (c.dryRun) return commitGuard(c)
          await pages.bulk.progressLink(page).click()
          await pages.obligations.heading(page).waitFor()
          const after = await pages.obligations.readGrid(page)
          const rows = c.db
            .listPrns(c.user.orgExternalId)
            .filter((p) => state.picked.includes(p.PrnNumber))
          return `${(await page.locator('main h1').innerText()).trim()} | before ${totalsLine(state.before)} → after ${totalsLine(after)} | DB: ${rows.map((r) => `${r.PrnNumber} status ${r.PrnStatusId} year ${r.ObligationYear}`).join('; ')}`
        },
        expected: ({ ctx: c }) =>
          `"Manage your ${c.complianceYear} recycling obligations": accepted total up by the selected tonnage and awaiting down by the same; both PRNs status 1 with ObligationYear ${c.complianceYear}.`
      }
    ]
  }
}
