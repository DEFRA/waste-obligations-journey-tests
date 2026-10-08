'use strict'

const pages = require('../lib/pages')
const { setLanguage } = require('../lib/session')
const { signInStep, prnIdByNumber, DEFAULT_PRNS } = require('./_common')

// Welsh (cy) pass over the Multi-Year / December Waste screens. Read-only.
// Flags English strings that leaked through and checks <html lang>.

const ENGLISH_MARKERS = [
  /choose a year/i,
  /which year.s recycling obligations/i,
  /manage recycling obligations/i,
  /view or manage your recycling obligations by year/i,
  /can be accepted towards/i,
  /are you sure you want to accept/i,
  /recycling obligations/i,
  /select a year/i,
  /continue/i,
  /december waste/i,
  /select_all_that_apply/
]

async function audit(page) {
  const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
  const lang = await page.locator('html').getAttribute('lang')
  const leaks = ENGLISH_MARKERS.filter((r) => r.test(text)).map((r) =>
    r.source.replace(/\\|\./g, '').replace(/\/i$/, '')
  )
  return `html lang="${lang}"; English strings found: ${leaks.length ? leaks.join(', ') : 'none'}`
}

function screen(id, title, go, expected) {
  return {
    id,
    title,
    action: async ({ page, ctx }) => {
      await go(page, ctx)
      return audit(page)
    },
    expected
  }
}

module.exports = {
  id: 'MYDW-10',
  title: 'Welsh language (cy)',
  buildSteps: async (ctx) => {
    const dw = ctx.prnNumber || DEFAULT_PRNS[ctx.orgType].dw
    const state = {}
    return [
      signInStep('01'),
      screen(
        '02',
        'Switch to Cymraeg — account home tile',
        async (page) => {
          await setLanguage(page, 'cy')
        },
        'Home page in Welsh, including the "Manage recycling obligations" tile, its "by year" text and the deadline line. <html lang="cy">.'
      ),
      screen(
        '03',
        'Choose a year (cy)',
        async (page) => {
          await page.goto(pages.chooseYear.path)
        },
        'Heading, legend and button in Welsh. Known: heading/legend still English ("Choose a year") on the local stack.'
      ),
      screen(
        '04',
        'Choose a year — validation (cy)',
        async (page) => {
          await pages.chooseYear.continue(page).click()
        },
        'Error summary "Mae problem" and error message in Welsh.'
      ),
      screen(
        '05',
        'Obligations page (cy)',
        async (page, c) => {
          await pages.chooseYear.choose(page, c.complianceYear + 1)
        },
        'Obligations page for next year fully in Welsh, including the "not calculated yet" and December waste explainer copy.'
      ),
      screen(
        '06',
        'Accept or reject list (cy)',
        async (page) => {
          await page.goto(pages.prnList.path)
        },
        'List in Welsh, including the December waste column, sort option and any blue "Can be accepted towards…" tags. No raw resource keys.'
      ),
      screen(
        '07',
        `PRN page ${dw} (cy)`,
        async (page) => {
          state.id = await prnIdByNumber(page, dw, ctx)
          await page.goto(pages.prn.path(state.id))
        },
        'PRN details and the December warning in Welsh.'
      ),
      screen(
        '08',
        'Which year — acceptance year page (cy)',
        async (page) => {
          await page.goto(pages.chooseAcceptanceYear.path(state.id))
        },
        'Year question in Welsh. Known: English on the local stack (resx cy values are English copies).'
      ),
      screen(
        '09',
        'Accept confirmation (cy)',
        async (page, c) => {
          if (await pages.chooseAcceptanceYear.radios(page).count()) {
            await pages.chooseAcceptanceYear.radios(page).first().check()
            await pages.chooseAcceptanceYear.continue(page).click()
          } else {
            await page.goto(pages.acceptConfirm.path(state.id))
          }
        },
        'Confirmation question and buttons in Welsh. Do not click "Yes" — this journey is read-only.'
      )
    ]
  }
}
