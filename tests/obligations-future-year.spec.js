import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '../fixtures/pages.fixture.js'
import {
  skipUnlessFeatureFlagEnabled,
  skipUnlessEnabled,
  FEATURE_MANAGE_OBLIGATIONS
} from '../utils/environment-features.js'
import {
  getObligationsUrl,
  getWasteObligationsFrontendBaseUrl,
  usesPackagingEntryPoint
} from '../utils/journey-entry-point.js'
import {
  getComplianceYear,
  isFutureYearWindow
} from '../utils/journey-clock.js'
import { getOrgId, readObligations } from '../utils/waste-obligations-api.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_DIR = path.join(__dirname, '..', 'playwright', '.auth')

const ACCOUNTS = [
  { account: 'dp', label: 'Producer (DP)', authFile: 'dp.json' },
  { account: 'cso', label: 'Compliance scheme (CSO)', authFile: 'cso.json' }
]

const ENGLISH = {
  deadline: (deadlineYear) => `31 January ${deadlineYear}`,
  reviewHeading: (year) => `Review your PRNs and PERNs for ${year}`,
  acceptRejectLink: (year) => `Accept or reject PRNs and PERNs for ${year}`
}

const WELSH = {
  deadline: (deadlineYear) => `31 Ionawr ${deadlineYear}`,
  reviewHeading: (year) => `Adolygu’ch PRNs a’ch PERNs ar gyfer ${year}`,
  acceptRejectLink: (year) => `Derbyn neu wrthod PRNs a PERNs ar gyfer ${year}`
}

const WELSH_HEADING = (year) =>
  new RegExp(`rhwymedigaethau ailgylchu ar gyfer ${year}`, 'i')

function cdpUrl(account, year, extra = {}) {
  const url = new URL(
    getObligationsUrl(account, year).toString(),
    getWasteObligationsFrontendBaseUrl()
  )
  for (const [key, value] of Object.entries(extra)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

for (const { account, label, authFile } of ACCOUNTS) {
  test.describe(`Obligations for a future year - ${label}`, () => {
    test.use({ storageState: path.join(AUTH_DIR, authFile) })

    test.beforeEach(async ({ request }) => {
      skipUnlessFeatureFlagEnabled(FEATURE_MANAGE_OBLIGATIONS)
      skipUnlessEnabled(
        !usesPackagingEntryPoint(),
        'The future year is opened on the CDP obligations page directly'
      )
      skipUnlessEnabled(
        isFutureYearWindow(),
        'Next year can be chosen only in December and January: run with the frontend clock and JOURNEY_NOW set to a date in that window'
      )

      const nextYear = getComplianceYear() + 1
      const obligations = await readObligations(
        request,
        getOrgId(account),
        nextYear
      )
      skipUnlessEnabled(
        obligations.every((o) => o.status === 'NoDataYet'),
        `The organisation already has data for ${nextYear}`
      )
    })

    // The frontend keeps the chosen language in the session, and every test
    // reuses the saved sign-in session, so Welsh is switched back afterwards.
    test.afterEach(async ({ page }) => {
      await page.goto(cdpUrl(account, getComplianceYear(), { lang: 'en' }), {
        timeout: 60_000
      })
    })

    test('AC1: next year shows zeros and No data yet, with the year in the dynamic content', async ({
      page,
      obligationsPage
    }) => {
      const nextYear = getComplianceYear() + 1

      await page.goto(cdpUrl(account, nextYear), { timeout: 60_000 })

      await obligationsPage.expectLoadedForYear(nextYear)
      await obligationsPage.expectNoDataTable()
      await obligationsPage.expectYearContent(nextYear, ENGLISH)
      await obligationsPage.expectNotCalculatedContent(nextYear)
    })

    test('AC2: next year is shown in Welsh', async ({
      page,
      obligationsPage
    }) => {
      const nextYear = getComplianceYear() + 1

      await page.goto(cdpUrl(account, nextYear, { lang: 'cy' }), {
        timeout: 60_000
      })

      await expect(obligationsPage.heading).toHaveText(WELSH_HEADING(nextYear))
      await obligationsPage.expectYearContent(nextYear, WELSH)
      await expect(page.getByRole('main')).not.toContainText(
        'recycling obligations have not been calculated yet'
      )
    })
  })

  test.describe(`Compliance record PRN download - ${label}`, () => {
    test.use({ storageState: path.join(AUTH_DIR, authFile) })

    test.beforeEach(() => {
      skipUnlessFeatureFlagEnabled(FEATURE_MANAGE_OBLIGATIONS)
      skipUnlessEnabled(
        !usesPackagingEntryPoint(),
        'The download is checked on the CDP compliance record directly'
      )
    })

    test('2025 offers a CSV of the PRNs and PERNs, or says there are none', async ({
      page,
      complianceRecordPage
    }) => {
      await page.goto(cdpUrl(account, 2025), { timeout: 60_000 })
      await complianceRecordPage.expectLoadedFor(2025, account)

      const link = complianceRecordPage.downloadLink(2025)
      await expect(link).toBeVisible()

      const response = await page.request.get(
        new URL(await link.getAttribute('href'), page.url()).toString()
      )

      expect(response.ok()).toBe(true)
      const problems = await complianceRecordPage.findDownloadProblems(
        response,
        2025
      )

      expect(problems).toEqual([])
    })
  })
}
