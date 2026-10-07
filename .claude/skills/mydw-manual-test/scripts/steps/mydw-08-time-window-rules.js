'use strict'

const pages = require('../lib/pages')
const { signInStep } = require('./_common')

// Read-only. For every PRN the org holds, compares what the UI offers at the frontend's (time-shifted) clock with
// lib/rules.js. Run once per scenario S0..S3 (see reference/scenarios.md). Never commits: GET accept-prn and
// choose-acceptance-year only render pages.

module.exports = {
  id: 'MYDW-08',
  title: 'December Waste time-window rules (per PRN, per scenario)',
  preconditionsSummary: (ctx) => [
    `Expected availability computed from lib/rules.js at ${ctx.now.toISOString()} (C=${ctx.complianceYear}).`,
    'PRN data restored to snapshot; optionally a DW PRN moved into the Dec–Jan issue window with --seed-flash.'
  ],
  buildSteps: async (ctx) => {
    const prns = ctx.db.listPrns(ctx.user.orgExternalId)
    const ui = {}
    const steps = [
      signInStep('01'),
      {
        id: '02',
        title: '"Choose a year" options',
        action: async ({ page }) => {
          await page.goto(pages.chooseYear.path)
          return (
            await pages.chooseYear
              .radios(page)
              .evaluateAll((r) => r.map((x) => x.value))
          ).join(', ')
        },
        expected: `Radios: ${ctx.rules.yearOptions(ctx.now).join(', ')}.`
      },
      {
        id: '03',
        title: 'Read the accept/reject list',
        action: async ({ page }) => {
          const rows = await pages.readListRows(page)
          for (const r of rows) ui[r.num] = r
          const awaitingDb = prns
            .filter((p) => Number(p.PrnStatusId) === ctx.rules.AWAITING)
            .map((p) => p.PrnNumber)
          const missing = awaitingDb.filter((n) => !ui[n])
          return `${rows.length} rows over ${Math.max(0, ...rows.map((r) => r.page))} page(s)${missing.length ? `; MISMATCH: not listed: ${missing.join(', ')}` : '; every awaiting note listed'}`
        },
        expected:
          'Every PRN and PERN with status AWAITING ACCEPTANCE is listed across the pages (accepted/rejected ones are not).'
      }
    ]
    let n = 4
    for (const p of prns) {
      const e = ctx.rules.expectedFor(p, ctx.now)
      const awaiting = Number(p.PrnStatusId) === ctx.rules.AWAITING
      steps.push({
        id: String(n++).padStart(2, '0'),
        title: `${p.PrnNumber} (${p.IsExport ? 'PERN' : 'PRN'}, ${p.DecemberWaste ? 'DW' : 'std'} ${p.ObligationYear}, issued ${p.IssueDate.slice(0, 10)})`,
        action: async ({ page }) => {
          if (!awaiting)
            return `status ${p.PrnStatusId} — listed: ${!!ui[p.PrnNumber]}`
          const row = ui[p.PrnNumber]
          const id = (row && row.id) || p.ExternalId
          await page.goto(pages.prn.path(id))
          const accept = (await pages.prn.acceptLink(page).count()) > 0
          const reject = (await pages.prn.rejectLink(page).count()) > 0
          let years = []
          let route = '-'
          if (accept) {
            await pages.prn.acceptLink(page).click()
            await page.waitForLoadState('domcontentloaded')
            route = new URL(page.url()).pathname.split('/')[2]
            if (route === 'choose-acceptance-year')
              years = await pages.chooseAcceptanceYear
                .radios(page)
                .evaluateAll((r) => r.map((x) => Number(x.value)))
            else {
              const m = (await page.locator('main').innerText()).match(
                /towards your (\d{4}) recycling/
              )
              years = m ? [Number(m[1])] : []
            }
          }
          const got = {
            actionable: accept && reject,
            years,
            bulkCheckbox: !!(row && row.cb),
            flash: !!(row && row.flash)
          }
          const diffs = []
          if (got.actionable !== e.actionable)
            diffs.push(`actions ${got.actionable ? 'shown' : 'hidden'}`)
          if (JSON.stringify(got.years) !== JSON.stringify(e.years))
            diffs.push(`years [${got.years}] vs [${e.years}]`)
          if (got.bulkCheckbox !== e.bulkCheckbox)
            diffs.push(`checkbox ${got.bulkCheckbox ? 'shown' : 'missing'}`)
          if (got.flash !== e.flash)
            diffs.push(
              `flash ${got.flash ? `shown "${row.flash}"` : 'missing'}`
            )
          return `${diffs.length ? `MISMATCH: ${diffs.join('; ')}` : 'matches rules'} — UI: actions ${got.actionable}, years [${got.years}] via ${route}, checkbox ${got.bulkCheckbox}, flash ${got.flash ? `"${row.flash}"` : 'no'}`
        },
        expected: awaiting
          ? `Rules: ${ctx.rules.describe(p, ctx.now)}.`
          : `Status ${p.PrnStatusId} (not awaiting): not on the accept/reject list.`
      })
    }
    return steps
  }
}
