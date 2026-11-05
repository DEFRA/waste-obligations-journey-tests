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

// The CDP obligations page for a year, on the CDP frontend.
function cdpObligationsUrl(account, year) {
  return new URL(
    getObligationsUrl(account, year).toString(),
    getWasteObligationsFrontendBaseUrl()
  ).toString()
}

for (const { account, label, authFile } of ACCOUNTS) {
  test.describe(`Obligations year rules - ${label}`, () => {
    test.use({ storageState: path.join(AUTH_DIR, authFile) })

    test.beforeEach(() => {
      skipUnlessFeatureFlagEnabled(FEATURE_MANAGE_OBLIGATIONS)
      skipUnlessEnabled(
        !usesPackagingEntryPoint(),
        'The year rules are checked on the CDP obligations page directly'
      )
    })

    test('2025 opens the compliance record, with the regulator contact', async ({
      page,
      complianceRecordPage
    }) => {
      await page.goto(cdpObligationsUrl(account, 2025), { timeout: 60_000 })

      await complianceRecordPage.expectLoadedFor(2025, account)
      await complianceRecordPage.expectProcessedOutsideService(2025, account)
      await complianceRecordPage.expectRegulatorContact()
      expect(new URL(page.url()).pathname).toContain(
        '/obligations/compliance-record'
      )
    })

    test('a year beyond next year opens the current year', async ({
      page,
      obligationsPage
    }) => {
      const currentYear = getComplianceYear()

      await page.goto(cdpObligationsUrl(account, currentYear + 2), {
        timeout: 60_000
      })

      await obligationsPage.expectLoadedForYear(currentYear)
      expect(new URL(page.url()).searchParams.get('year')).toBe(
        String(currentYear)
      )
    })

    test('next year is offered only in December and January', async ({
      page,
      request,
      obligationsPage
    }) => {
      const currentYear = getComplianceYear()
      const nextYear = currentYear + 1

      await page.goto(cdpObligationsUrl(account, nextYear), { timeout: 60_000 })

      // eslint-disable-next-line playwright/no-conditional-in-test -- the rule differs inside and outside the December and January window
      if (!isFutureYearWindow()) {
        await obligationsPage.expectLoadedForYear(currentYear)
        return
      }

      await obligationsPage.expectLoadedForYear(nextYear)

      const obligations = await readObligations(
        request,
        getOrgId(account),
        nextYear
      )
      const noPomData = obligations.every((o) => o.status === 'NoDataYet')

      skipUnlessEnabled(
        noPomData,
        `The organisation already has data for ${nextYear}, so the not-calculated content is not shown`
      )

      await obligationsPage.expectNotCalculatedContent(nextYear)
    })

    test('a year with data shows the usual advice, not the not-calculated content', async ({
      page,
      request,
      obligationsPage
    }) => {
      const currentYear = getComplianceYear()
      const obligations = await readObligations(
        request,
        getOrgId(account),
        currentYear
      )

      skipUnlessEnabled(
        obligations.some((o) => o.status !== 'NoDataYet'),
        `The organisation has no data for ${currentYear}`
      )

      await page.goto(cdpObligationsUrl(account, currentYear), {
        timeout: 60_000
      })

      await obligationsPage.expectLoadedForYear(currentYear)
      await obligationsPage.expectNoNotCalculatedContent()
    })
  })
}
