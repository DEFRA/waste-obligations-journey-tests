import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '../fixtures/pages.fixture.js'
import { skipUnlessPrnsConfigured } from '../utils/environment-features.js'
import {
  getObligationsUrl,
  getPrnsListUrl,
  getWasteObligationsFrontendBaseUrl
} from '../utils/journey-entry-point.js'
import { getJourneyYear } from '../utils/journey-year.js'
import { getOrgId, listAwaitingPrns } from '../utils/waste-obligations-api.js'
import { getComplianceYear, getJourneyNow } from '../utils/journey-clock.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_DIR = path.join(__dirname, '..', 'playwright', '.auth')

const YEAR = getJourneyYear()
const NEXT_YEAR = YEAR + 1
const PAGE_SIZE = 100

// The list's year switcher accepts the current compliance year plus one.
const nextYearSelectable = NEXT_YEAR <= getComplianceYear(getJourneyNow()) + 1
const COUNT_YEARS = nextYearSelectable ? [YEAR, NEXT_YEAR] : [YEAR]

// ENVIRONMENT=local seeds the notes these checks rely on; a deployed target
// can't guarantee them, so a check without data is skipped there.
const requireSeededData = process.env.ENVIRONMENT === 'local'

const ACCOUNTS = [
  { account: 'dp', label: 'Producer (DP)', authFile: 'dp.json' },
  { account: 'cso', label: 'Compliance scheme (CSO)', authFile: 'cso.json' }
]

function frontendUrl(url, params = {}) {
  const target = new URL(url.toString(), getWasteObligationsFrontendBaseUrl())
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, String(value))
  }
  return target.toString()
}

async function listedNumbers({ page, prnsListPage }, url) {
  await page.goto(url, { timeout: 60_000 })
  await prnsListPage.expectLoaded()
  return (await prnsListPage.readPrnRows()).map((row) => row.number)
}

async function listedTotal({ page, prnsListPage }, url) {
  await page.goto(url, { timeout: 60_000 })
  await prnsListPage.expectLoaded()
  const summary = await prnsListPage.readResultsSummary()
  return summary?.total ?? 0
}

for (const { account, label, authFile } of ACCOUNTS) {
  test.describe(`PRNs list is filtered by year - ${label}`, () => {
    test.use({ storageState: path.join(AUTH_DIR, authFile) })

    const listUrl = (year, params = {}) =>
      frontendUrl(getPrnsListUrl(account, year), params)

    test.beforeEach(() => {
      skipUnlessPrnsConfigured()
    })

    test('the obligations count equals the list total for the year', async ({
      page,
      prnsListPage,
      obligationsPage
    }) => {
      for (const year of COUNT_YEARS) {
        await test.step(`${year}: the count on the obligations page matches the list`, async () => {
          await page.goto(frontendUrl(getObligationsUrl(account, year)), {
            timeout: 60_000
          })
          const count = await obligationsPage.readAwaitingAcceptanceCount()

          const total = await listedTotal(
            { page, prnsListPage },
            listUrl(year, { pageSize: PAGE_SIZE })
          )

          expect(
            count,
            `The obligations page counts ${count} awaiting for ${year} but the list shows ${total}.`
          ).toBe(total)
        })
      }
    })

    test('a standard note is listed only for the year it can be accepted into', async ({
      page,
      request,
      prnsListPage
    }) => {
      test.skip(
        !nextYearSelectable,
        `${NEXT_YEAR} is not a selectable year on this target`
      )

      const prns = await listAwaitingPrns(request, getOrgId(account))
      const standard = prns.find(
        (prn) => prn.decemberWaste === false && prn.obligationYear === YEAR
      )
      test.skip(
        !standard && !requireSeededData,
        `No standard ${YEAR} PRN awaiting acceptance on this target`
      )
      expect(
        standard,
        `The local fixture must seed a standard ${YEAR} PRN awaiting acceptance.`
      ).toBeDefined()

      await test.step(`it is on the ${YEAR} list`, async () => {
        const numbers = await listedNumbers(
          { page, prnsListPage },
          listUrl(YEAR, { pageSize: PAGE_SIZE })
        )
        expect(numbers).toContain(standard.number)
      })

      await test.step(`it is not on the ${NEXT_YEAR} list`, async () => {
        const numbers = await listedNumbers(
          { page, prnsListPage },
          listUrl(NEXT_YEAR, { pageSize: PAGE_SIZE })
        )
        expect(numbers).not.toContain(standard.number)
      })
    })

    test('the list without a year is the list for the year it names', async ({
      page,
      prnsListPage
    }) => {
      let defaultYear
      let defaultNumbers

      await test.step('open the list with no year', async () => {
        defaultNumbers = await listedNumbers(
          { page, prnsListPage },
          listUrl(undefined, { pageSize: PAGE_SIZE })
        )
        const heading = await prnsListPage.heading.textContent()
        defaultYear = Number(heading.match(/for (\d{4})/i)?.[1])
        expect(
          defaultYear,
          'The list without a year must name the year it shows in its heading.'
        ).toBeGreaterThan(2000)
      })

      await test.step('it matches the list for that year', async () => {
        const numbers = await listedNumbers(
          { page, prnsListPage },
          listUrl(defaultYear, { pageSize: PAGE_SIZE })
        )
        expect(numbers).toEqual(defaultNumbers)
      })
    })

    test('a page past the last shows the last page', async ({
      page,
      prnsListPage
    }) => {
      const total = await listedTotal(
        { page, prnsListPage },
        listUrl(YEAR, { pageSize: PAGE_SIZE })
      )
      test.skip(total < 2, `Fewer than two ${YEAR} notes to page through`)

      await test.step('request a page far beyond the end', async () => {
        await page.goto(listUrl(YEAR, { pageSize: 1, page: 999 }), {
          timeout: 60_000
        })
        await prnsListPage.expectLoaded()
      })

      await test.step('the last page is shown with a note on it', async () => {
        const summary = await prnsListPage.readResultsSummary()
        expect(summary).not.toBeNull()
        expect(summary.to).toBe(summary.total)
        expect(await prnsListPage.readPrnRows()).toHaveLength(1)
      })
    })
  })
}
