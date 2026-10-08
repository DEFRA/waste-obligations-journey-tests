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

// December Waste PRN or PERN accepted through the single flow with an explicit choice of obligation year.
// --prn <number> | --note PERN (seeded PERN) ; --accept-year <Y> (default: the later of the offered years).

function target(ctx) {
  const number = pickPrn(ctx, 'dw')
  const prn = ctx.db
    .listPrns(ctx.user.orgExternalId)
    .find((p) => p.PrnNumber === number)
  if (!prn) throw new Error(`${number} not found for ${ctx.user.orgName}`)
  const e = ctx.rules.expectedFor(prn, ctx.now)
  const acceptYear = ctx.acceptYear || e.years[e.years.length - 1]
  const otherYear = e.years.find((y) => y !== acceptYear) || null
  const n = noun(prn)
  return {
    number,
    prn,
    e,
    acceptYear,
    otherYear,
    n,
    material: gridMaterial(prn.MaterialName)
  }
}

// Expected copy (resx en). PERN has no multi-year confirm key: the view falls back to the legacy pern_heading.
function copy(t) {
  return {
    noteHeading:
      t.n === 'PERN'
        ? 'Packaging Waste Export Recycling Note'
        : 'Packaging Waste Recycling Note',
    warning:
      t.n === 'PERN'
        ? `This PERN relates to waste exported for reprocessing in December ${t.prn.ObligationYear}.`
        : `This PRN relates to waste received for reprocessing in December ${t.prn.ObligationYear}.`,
    yearQuestion: `Which year’s recycling obligations do you want to accept this ${t.n} towards?`,
    confirm: `Are you sure you want to accept this ${t.n} towards your ${t.acceptYear} recycling obligations?`,
    confirmTitle: `Accept this ${t.n}`,
    banner: `You accepted this ${t.n} towards your ${t.acceptYear} recycling obligations`
  }
}

module.exports = {
  id: 'MYDW-04',
  title: 'December Waste PRN/PERN — accept with a choice of year',
  applies: (ctx) => {
    if (String(ctx.flags.ShowMultiYearObligations) !== 'true')
      return 'ShowMultiYearObligations is off (use MYDW-09)'
    const t = target(ctx)
    if (!t.e.actionable)
      return `${t.number} is not actionable at this clock (${ctx.rules.describe(t.prn, ctx.now)}); run --restore or pick another --prn`
    if (ctx.acceptYear && !t.e.years.includes(ctx.acceptYear))
      return `--accept-year ${ctx.acceptYear} not offered for ${t.number} (offered: ${t.e.years.join('/')})`
    return true
  },
  preconditionsSummary: (ctx) => {
    const t = target(ctx)
    return [
      `${t.n} under test: ${ctx.rules.describe(t.prn, ctx.now)}.`,
      `Accepting towards ${t.acceptYear}${t.otherYear ? ` (other offered year ${t.otherYear})` : ''}.`,
      'Data restored to snapshot before the cell (gather.js --restore).'
    ]
  },
  buildSteps: async (ctx) => {
    const t = target(ctx)
    const c = copy(t)
    const state = {}
    return [
      signInStep('01'),
      {
        id: '02',
        title: `Record ${t.acceptYear}${t.otherYear ? ` and ${t.otherYear}` : ''} grids before accepting`,
        action: async ({ page }) => {
          state.before = {
            [t.acceptYear]: await openObligations(page, t.acceptYear)
          }
          if (t.otherYear)
            state.before[t.otherYear] = await openObligations(page, t.otherYear)
          return Object.entries(state.before)
            .map(([y, g]) => `${y} ${gridLine(g, t.material)}`)
            .join(' | ')
        },
        expected: 'Baseline captured (screenshot shows the last grid opened).'
      },
      {
        id: '03',
        title: `Open ${t.number}`,
        action: async ({ page }) => {
          state.id = await prnIdByNumber(page, t.number, ctx)
          await page.goto(pages.prn.path(state.id))
          await pages.prn.heading(page).waitFor()
          const h1 = (await page.locator('main h1').innerText()).trim()
          const warn = (
            await pages.prn
              .decemberWarning(page)
              .innerText()
              .catch(() => '')
          )
            .replace(/\s+/g, ' ')
            .replace(/^! Warning /, '')
            .trim()
          const tag = await page
            .getByText(/can be accepted towards/i)
            .first()
            .innerText()
            .catch(() => '')
          const issues = []
          if (h1 !== c.noteHeading) issues.push(`heading "${h1}"`)
          if (warn !== c.warning) issues.push(`warning "${warn}"`)
          if (!!tag !== t.e.flash)
            issues.push(`tag ${tag ? 'shown' : 'missing'}`)
          return `${issues.length ? `MISMATCH: ${issues.join('; ')} — ` : ''}h1 "${h1}"; warning "${warn}"; tag "${tag || 'none'}"`
        },
        expected: `"${c.noteHeading}", "December waste? Yes", warning "${c.warning}", buttons "Accept this ${t.n}" / "Reject this ${t.n}". Blue tag: ${t.e.flashText ? `"${t.e.flashText}"` : 'none expected (outside the Dec–Jan window or issue date outside it)'}.`
      },
      {
        id: '04',
        title: `Accept this ${t.n} → year choice page`,
        action: async ({ page }) => {
          await pages.prn.acceptLink(page).click()
          await page.waitForLoadState('domcontentloaded')
          const radios = await pages.chooseAcceptanceYear
            .radios(page)
            .evaluateAll((r) => r.map((x) => x.value))
            .catch(() => [])
          const h1 = await page
            .locator('main h1')
            .first()
            .innerText()
            .catch(() => '')
          return `URL ${new URL(page.url()).pathname}; h1 "${h1.trim()}"; years offered: ${radios.join(', ') || 'none (no year page)'}`
        },
        expected: () =>
          t.e.choiceOfYear
            ? `"${c.yearQuestion}" with radios ${t.e.years.join(' and ')} and Continue.`
            : `No year page: goes straight to the confirmation for ${t.e.years[0]} (only one year is available at this clock).`
      },
      {
        id: '05',
        title: 'Continue without choosing a year',
        action: async ({ page }) => {
          if (!t.e.choiceOfYear) return 'n/a — no year page'
          await pages.chooseAcceptanceYear.continue(page).click()
          return (
            await page
              .locator('.govuk-error-summary')
              .innerText()
              .catch(() => 'no error summary')
          ).replace(/\s+/g, ' ')
        },
        expected: () =>
          t.e.choiceOfYear
            ? 'Error summary "There is a problem — Select a year"; stays on the page.'
            : 'SKIP — no year page in this scenario.'
      },
      {
        id: '06',
        title: `Choose ${t.acceptYear} → confirmation`,
        hypothesis: 'H4',
        observe:
          'Does the user hesitate over "Yes, accept" vs "No, go back"? What do they expect "No, go back" to do?',
        action: async ({ page }) => {
          if (t.e.choiceOfYear) {
            await pages.chooseAcceptanceYear.radio(page, t.acceptYear).check()
            await pages.chooseAcceptanceYear.continue(page).click()
          }
          await pages.acceptConfirm.question(page).waitFor()
          const question = (
            await pages.acceptConfirm.question(page).innerText()
          ).trim()
          const title = (await page.title()).split(' - ')[0].trim()
          const issues = []
          if (question !== c.confirm) issues.push(`question "${question}"`)
          if (title !== c.confirmTitle) issues.push(`page title "${title}"`)
          return `${issues.length ? `MISMATCH: ${issues.join('; ')} — ` : ''}${(await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 260)}`
        },
        expected: `"${c.confirm}" / "This will contribute ${t.prn.TonnageValue} tonnes towards your recycling obligation for ${t.material.toLowerCase()}." / "Yes, accept" and "No, go back". Browser title "${c.confirmTitle}".${t.n === 'PERN' ? ' Known (K12): PERN shows the legacy "Accept this PERN towards your Y recycling obligations?" and title "Accept this PRN".' : ''}`
      },
      {
        id: '07',
        title: '"No, go back" then accept again',
        hypothesis: 'H4',
        action: async ({ page }) => {
          await pages.acceptConfirm.noGoBack(page).click()
          await page.waitForLoadState('domcontentloaded')
          const back = new URL(page.url()).pathname
          await pages.prn.acceptLink(page).click()
          await page.waitForLoadState('domcontentloaded')
          const again = new URL(page.url()).pathname
          if (t.e.choiceOfYear && again.includes('choose-acceptance-year')) {
            const checked = await page
              .locator('input[name=SelectedYear]:checked')
              .getAttribute('value')
              .catch(() => null)
            await pages.chooseAcceptanceYear.radio(page, t.acceptYear).check()
            await pages.chooseAcceptanceYear.continue(page).click()
            await pages.acceptConfirm.question(page).waitFor()
            return `"No, go back" → ${back}; Accept again → year page (pre-selected: ${checked || 'none'}) → confirm`
          }
          return `"No, go back" → ${back}; Accept again → ${again}`
        },
        expected: `"No, go back" returns to the ${t.n} page (not the year page). Observed on the local stack: clicking Accept again skips the year page and reuses ${t.acceptYear} from session — the user cannot see or change the year without starting over. Check this against the ACs (H4: can the user recover if they change their mind about the year?).`
      },
      {
        id: '08',
        title: 'Yes, accept',
        action: async ({ page }) => {
          if (ctx.dryRun) return commitGuard(ctx)
          await pages.acceptConfirm.yes(page).click()
          await pages.accepted.bannerTitle(page).waitFor()
          const banner = (
            await pages.accepted.banner(page).innerText()
          ).replace(/\s+/g, ' ')
          return `${banner.includes(c.banner) ? '' : 'MISMATCH: banner text — '}${banner}`
        },
        expected: `Success banner "${c.banner}" / "You have contributed ${t.prn.TonnageValue} tonnes towards your recycling obligation for ${t.material.toLowerCase()}."; ${t.n} shows Status ACCEPTED and "Accepted towards ${t.acceptYear} recycling obligations"; buttons "Accept or reject more PRNs and PERNs" and "View recycling obligations progress".`
      },
      {
        id: '09',
        title: '"View recycling obligations progress" from the success page',
        hypothesis: 'H5',
        observe:
          'Does the user feel done, or try to verify elsewhere? Which year do they expect to land on?',
        action: async ({ page }) => {
          if (ctx.dryRun) return commitGuard(ctx)
          await pages.accepted.progressLink(page).click()
          await pages.obligations.heading(page).waitFor()
          return `Landed on "${(await page.locator('main h1').innerText()).trim()}"`
        },
        expected: `Lands on "Manage your ${t.acceptYear} recycling obligations" so the user can see the ${t.n} counted. Known (K3): it shows the year last chosen on "Choose a year", which after step 02 is ${t.otherYear || t.acceptYear} — FAIL/NOTE if it is not ${t.acceptYear}.`
      },
      {
        id: '10',
        title: `Verify the ${t.acceptYear} grid`,
        hypothesis: 'H5',
        action: async ({ page }) => {
          if (ctx.dryRun) return commitGuard(ctx)
          const after = await openObligations(page, t.acceptYear)
          const row = ctx.db
            .listPrns(ctx.user.orgExternalId)
            .find((p) => p.PrnNumber === t.number)
          return `before ${gridLine(state.before[t.acceptYear], t.material)} → after ${gridLine(after, t.material)}; DB: status ${row.PrnStatusId}, ObligationYear ${row.ObligationYear}`
        },
        expected: `${t.material}: accepted +${t.prn.TonnageValue} t${t.prn.ObligationYear === String(t.acceptYear) ? ` and awaiting −${t.prn.TonnageValue} t` : ''} for ${t.acceptYear}. DB: PrnStatusId 1 and ObligationYear ${t.acceptYear}.`
      },
      {
        id: '11',
        title: t.otherYear
          ? `Verify the ${t.otherYear} grid`
          : 'No other year to verify',
        action: async ({ page }) => {
          if (ctx.dryRun) return commitGuard(ctx)
          if (!t.otherYear) return 'n/a'
          const after = await openObligations(page, t.otherYear)
          return `before ${gridLine(state.before[t.otherYear], t.material)} → after ${gridLine(after, t.material)}`
        },
        expected: t.otherYear
          ? `${t.otherYear}: accepted tonnage unchanged${t.prn.ObligationYear === String(t.otherYear) ? `; awaiting −${t.prn.TonnageValue} t (the ${t.n} no longer awaits acceptance in its original year)` : ''}.`
          : 'SKIP.'
      }
    ]
  }
}
