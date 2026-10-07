'use strict'

const pages = require('../lib/pages')
const { signInStep, openObligations } = require('./_common')

// All pages of the list (10 rows per page).
function listState(page, query = '') {
  return pages.readListRows(page, pages.prnList.path, query)
}

module.exports = {
  id: 'MYDW-03',
  title:
    'Accept or reject list (selection rules, DW column, reject discoverability)',
  preconditionsSummary: () => [
    'PRN data restored to snapshot (gather.js --restore) so all seeded awaiting PRNs are listed.'
  ],
  steps: [
    signInStep('01'),
    {
      id: '02',
      title: 'Open the list via the obligations page',
      action: async ({ page, ctx }) => {
        await openObligations(page, ctx.year)
        await pages.obligations.acceptOrRejectLink(page).click()
        await pages.prnList.heading(page).waitFor()
        const rows = await listState(page)
        const pagesSeen = Math.max(...rows.map((r) => r.page))
        return `${rows.length} rows over ${pagesSeen} page(s): ${rows.map((r) => `${r.num}${r.cb ? ' [checkbox]' : ''}`).join(', ')}`
      },
      expected:
        'Every awaiting PRN and PERN of the org is listed (10 per page, with pagination). Heading "Accept or reject PRNs and PERNs"; intro "Select the PRNs and PERNs you want to accept. You can also review each one by opening it and selecting \'accept\' or \'reject\'."; columns PRN or PERN number / Material / Date issued / December waste / Issued by / Tonnage / Issuer note.'
    },
    {
      id: '03',
      title: 'Compare checkboxes with the December Waste rules',
      action: async ({ page, ctx }) => {
        const rows = await listState(page)
        const dbPrns = ctx.db.listPrns(ctx.user.orgExternalId)
        const mismatches = []
        for (const r of rows) {
          const p = dbPrns.find((x) => x.PrnNumber === r.num)
          if (!p) continue
          const e = ctx.rules.expectedFor(p, ctx.now)
          if (e.bulkCheckbox !== r.cb)
            mismatches.push(
              `${r.num}: checkbox ${r.cb ? 'shown' : 'missing'}, expected ${e.bulkCheckbox ? 'shown' : 'missing'}`
            )
        }
        return mismatches.length
          ? `MISMATCH — ${mismatches.join('; ')}`
          : `All ${rows.length} rows match the rules`
      },
      expected:
        'A checkbox appears only for PRNs that can be accepted into exactly one year. December Waste PRNs that offer a choice of year, and PRNs that are not yet/no longer actionable, have no checkbox. (Run `gather.js --rules` to see the expected table.)'
    },
    {
      id: '04',
      title: 'Check the page copy (labels, legend, hidden text)',
      action: async ({ page }) => {
        const body = await page.locator('main').innerText()
        const issues = []
        if (/select_all_that_apply/.test(body))
          issues.push('raw resource key "select_all_that_apply" rendered')
        const legend = (
          await page
            .locator('main legend')
            .first()
            .innerText()
            .catch(() => '')
        ).trim()
        if (!legend) issues.push('empty <legend> on the selection fieldset')
        const suffix = await page
          .locator('main table a')
          .evaluateAll(
            (a) =>
              a.filter((x) => /PRN or PERN number/.test(x.innerText)).length
          )
        if (suffix)
          issues.push(
            `${suffix} PRN links carry visually-hidden "PRN or PERN number" text (check with a screen reader)`
          )
        return issues.length ? issues.join('; ') : 'no copy issues detected'
      },
      expected:
        'No raw resource keys, the checkbox group has a meaningful legend, and link text is sensible for screen readers.'
    },
    {
      id: '05',
      title: 'Sort by "December waste (yes to no)"',
      action: async ({ page }) => {
        // The sort form POSTs; pager links carry ?sortBy=…&page=N, so read every page through GET with sortBy.
        await page.goto(pages.prnList.path)
        const opt = await pages.prnList
          .sortSelect(page)
          .locator('option', { hasText: /december waste/i })
          .first()
          .getAttribute('value')
        await pages.prnList.sortSelect(page).selectOption(opt)
        const rows = (
          await listState(page, `sortBy=${encodeURIComponent(opt)}`)
        ).map((r) => r.cells[5] || '')
        const sorted =
          rows.join(',') ===
          [...rows]
            .sort((a, b) => (a === b ? 0 : a === 'Yes' ? -1 : 1))
            .join(',')
        return `${sorted ? '' : 'MISMATCH: not sorted — '}December waste column order (sortBy=${opt}): ${rows.join(', ')}`
      },
      expected:
        'All "Yes" December Waste rows are listed before "No" rows, across every page.'
    },
    {
      id: '06',
      title: 'Blue "Can be accepted towards…" tags',
      action: async ({ page, ctx }) => {
        const rows = await listState(page)
        const dbPrns = ctx.db.listPrns(ctx.user.orgExternalId)
        const exp = dbPrns
          .filter((p) => ctx.rules.expectedFor(p, ctx.now).flash)
          .map((p) => p.PrnNumber)
        const got = rows
          .filter((r) => r.flash)
          .map((r) => `${r.num} "${r.flash}"`)
        return `Expected tags on: ${exp.join(', ') || 'none'} | Shown: ${got.join(', ') || 'none'}`
      },
      expected: ({ ctx }) =>
        `A blue tag ("Can be accepted towards Y or Y+1 recycling obligations") shows under December Waste PRNs and PERNs only in December/January and only for notes issued in the current Dec–Jan window. Scenario ${ctx.scenario}: run \`gather.js --seed\` to add December-issued DW PRNs/PERNs (MYDW-*), or --seed-flash <PRN> to move an existing one.`
    },
    {
      id: '07',
      title: 'Look for a way to reject from the list',
      hypothesis: 'H3',
      observe:
        'Would a new or infrequent user find "reject"? The only call to action is "Accept selected PRNs and PERNs".',
      action: async ({ page }) => {
        const rejectOnList =
          (await page.getByRole('button', { name: /reject/i }).count()) +
          (await page.getByRole('link', { name: /^reject/i }).count())
        return `Reject controls on list: ${rejectOnList}; reject is only mentioned in the intro paragraph`
      },
      expected:
        'There is no reject control on the list; rejection is via opening a PRN. Record whether this is discoverable (NOTE) — this is research hypothesis H3.'
    },
    {
      id: '08',
      title: 'Open an actionable PRN and find Reject',
      hypothesis: 'H3',
      action: async ({ page }) => {
        await page.goto(pages.prnList.path)
        const first = page
          .locator(
            'main table tbody tr:has(input[type=checkbox]) a[href*="selected-prn"]'
          )
          .first()
        await first.click()
        await pages.prn.heading(page).waitFor()
        return `Accept link: ${(await pages.prn.acceptLink(page).count()) > 0}; Reject link: ${(await pages.prn.rejectLink(page).count()) > 0}`
      },
      expected:
        'PRN page shows "Accept this PRN" (primary) and "Reject this PRN" (secondary) buttons.'
    }
  ]
}
