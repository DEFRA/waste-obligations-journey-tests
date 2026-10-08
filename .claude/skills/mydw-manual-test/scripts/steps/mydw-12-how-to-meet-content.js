'use strict'

const pages = require('../lib/pages')
const { signInStep } = require('./_common')
const copy = require('../lib/copy')

// MO-449: the "How to meet your recycling obligations" section shows alternative content when the year's
// obligations have not been calculated (no H2 POM) and regular content when they have, behind
// ShowMultiYearObligations. Read-only. Expected copy is from epr-packaging-frontend main (#358):
//   Resources/Views/Shared/Partials/Prns/_meetingObligations.en.resx
//   Resources/Views/PrnsObligation/ObligationsHome.en.resx
// --year Y (flag on only; with the flag off the page is always the current compliance year).
// Expected copy lives in ../lib/copy.js (shared with tests/mydw-e2e.spec.js).

const SECTION_HEADING = 'How to meet your recycling obligations'

function expectedLines({ flagOn, calculated, year }) {
  return copy.howToMeet({ flagOn, calculated, year })
}

async function readSection(page) {
  const section = await pages.obligations.readHowToMeet(page)
  return (
    section && {
      lines: section.lines,
      details: section.details && section.details.summary
    }
  )
}

function calculatedInDb(ctx, year) {
  return ctx.db.calculationRows(ctx.user.orgExternalId, year)
}

module.exports = {
  id: 'MYDW-12',
  title: 'How to meet section: alternative vs regular content (MO-449)',
  preconditionsSummary: (ctx) => {
    const flagOn = String(ctx.flags.ShowMultiYearObligations) === 'true'
    const year = flagOn ? ctx.year : ctx.complianceYear
    const n = calculatedInDb(ctx, year)
    return [
      `Year under test: ${year}${flagOn ? '' : ' (flag off: always the current compliance year)'}.`,
      `ObligationCalculations rows for ${ctx.user.orgName} in ${year}: ${n} → expected ${n ? 'REGULAR (calculated)' : 'ALTERNATIVE (not calculated)'} content, ${flagOn ? 'multi-year' : 'legacy (flag off)'} copy.`
    ]
  },
  buildSteps: async (ctx) => {
    const flagOn = String(ctx.flags.ShowMultiYearObligations) === 'true'
    const year = flagOn ? ctx.year : ctx.complianceYear
    const calculated = calculatedInDb(ctx, year) > 0
    const expected = expectedLines({ flagOn, calculated, year })
    const other = expectedLines({ flagOn, calculated: !calculated, year })
    const variant = `${calculated ? 'regular' : 'alternative'} content, flag ${flagOn ? 'on' : 'off'}`
    const twoYearDw = ctx.db
      .listPrns(ctx.user.orgExternalId)
      .some((p) => ctx.rules.expectedFor(p, ctx.now).choiceOfYear)
    const { month } = (() => {
      const f = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        month: 'numeric'
      })
      return { month: Number(f.format(ctx.now)) }
    })()
    const expectDetails =
      flagOn &&
      !calculated &&
      year > ctx.complianceYear &&
      (month === 12 || month === 1) &&
      twoYearDw
    const state = {}
    return [
      signInStep('01'),
      {
        id: '02',
        title: `Open the ${year} obligations page`,
        action: async ({ page }) => {
          if (flagOn) {
            await pages.chooseYear.choose(page, year)
          } else {
            await page.goto(pages.obligations.path)
          }
          await pages.obligations.heading(page, year).waitFor()
          const body = (await page.locator('main').innerText()).replace(
            /\s+/g,
            ' '
          )
          const deadline = (body.match(/You have until [^.]*\./) || [
            '(no deadline line)'
          ])[0]
          return `"${(await page.locator('main h1').innerText()).trim()}"; ${deadline}`
        },
        expected: `"Manage your ${year} recycling obligations" with "You have until 31 January ${year + 1} to meet your recycling obligations for ${year}."`
      },
      {
        id: '03',
        title: `"${SECTION_HEADING}" section — ${variant}`,
        action: async ({ page }) => {
          state.section = await readSection(page)
          if (!state.section) return `MISMATCH: no "${SECTION_HEADING}" heading`
          const got = state.section.lines
          const missing = expected.filter((l) => !got.includes(l))
          const extra = got.filter((l) => !expected.includes(l))
          const order =
            missing.length === 0 && got.join('|') !== expected.join('|')
          const issues = [
            ...missing.map((l) => `missing "${l}"`),
            ...extra.map((l) => `unexpected "${l}"`),
            ...(order ? ['lines out of order'] : [])
          ]
          return `${issues.length ? `MISMATCH: ${issues.join('; ')}` : `matches the ${variant} copy exactly`} — shown: ${got.map((l) => `"${l}"`).join(' / ')}`
        },
        expected: `Heading "${SECTION_HEADING}" followed by exactly:\n${expected.map((l) => `  • ${l}`).join('\n')}\n${flagOn ? `Compare with Figma (${calculated ? 'regular' : 'alternative'} content frame).` : 'Compare with the pre-MO-449 content (flag off), not the new design.'}`
      },
      {
        id: '04',
        title: `The ${calculated ? 'alternative' : 'regular'} copy is not shown`,
        action: async () => {
          const got = (state.section && state.section.lines) || []
          const leaked = other.filter((l) => got.includes(l))
          return leaked.length
            ? `MISMATCH: also shows ${leaked.map((l) => `"${l}"`).join(' / ')}`
            : `none of the ${calculated ? 'alternative' : 'regular'} lines present`
        },
        expected: `No ${calculated ? 'alternative ("…have not been calculated yet…")' : 'regular ("Acquire and accept … until your recycling obligations are fully met…")'} text in the section.`
      },
      {
        id: '05',
        title: 'Progress table below the section',
        action: async ({ page }) => {
          const grid = await pages.obligations.readGrid(page)
          return `Totals: ${JSON.stringify(grid.Totals || {})}`
        },
        expected: calculated
          ? 'The "Your recycling obligations progress" table follows, with calculated obligations and a status (e.g. NOT MET) in Totals.'
          : 'The "Your recycling obligations progress" table follows with "Not available yet" / NO DATA YET and any tonnage awaiting acceptance or accepted.'
      },
      {
        id: '06',
        title: 'December waste details box (informational — out of scope)',
        action: async () =>
          `details box ${state.section && state.section.details ? `shown: "${state.section.details}"` : 'not shown'}`,
        expected: `${expectDetails ? 'Shown' : 'Not shown'}: "Why does the recycling obligations table already have tonnage awaiting acceptance?" appears only with the flag on, alternative content, a future year, the clock in Dec/Jan and an awaiting two-year December Waste note. The clickable Details component is out of scope for MO-449 — record, don't fail.`
      }
    ]
  }
}
