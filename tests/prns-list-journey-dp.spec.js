import { test, expect } from '../fixtures/pages.fixture.js'
import { requireEnv } from '../utils/env.js'
import { submitB2CCredentials } from '../utils/login.js'
import {
  getJourneyStartPath,
  usesPackagingEntryPoint,
  getProducerPrnsUrl
} from '../utils/journey-entry-point.js'
import { reportSkippedSteps } from '../utils/skipped-steps.js'
import { getOrgId, listAwaitingPrns } from '../utils/waste-obligations-api.js'

const YEAR = 2026

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Producer PRNs list (DP)', () => {
  test('log in and view the PRNs list for the requested year', async ({
    page,
    request,
    landingPage,
    chooseYearPage,
    obligationsPage,
    prnsListPage
  }) => {
    const prns =
      await test.step('read a PRN awaiting acceptance from the backend', async () => {
        return listAwaitingPrns(request, getOrgId('dp'))
      })
    expect(
      prns.length,
      'The journey producer needs at least one PRN awaiting acceptance; seed CI or provision deployed test data.'
    ).toBeGreaterThan(0)
    const expectedPrn = prns[0]
    expect(expectedPrn.number).toEqual(expect.any(String))
    expect(expectedPrn.number.trim()).not.toBe('')
    expect(expectedPrn.material).toEqual(expect.any(String))
    expect(expectedPrn.material.trim()).not.toBe('')
    expect(expectedPrn.issuer?.organisationName).toEqual(expect.any(String))
    expect(expectedPrn.issuer.organisationName.trim()).not.toBe('')
    expect(expectedPrn.tonnage).toEqual(expect.any(Number))

    const packaging = usesPackagingEntryPoint()
    const prnsUrl = getProducerPrnsUrl(YEAR)
    await test.step('open the entry point and sign in as the producer', async () => {
      await page.goto(
        packaging ? getJourneyStartPath('dp', YEAR) : prnsUrl.toString(),
        { timeout: 60_000 }
      )
      await submitB2CCredentials(
        page,
        requireEnv('EPR_USER_EMAIL'),
        requireEnv('EPR_USER_PASSWORD')
      )
    })

    if (packaging) {
      await test.step('open year selection from Azure account home', async () => {
        await landingPage.expectLoaded()
        await landingPage.goToChooseYear()
        await chooseYearPage.expectLoaded()
      })
      await test.step(`select ${YEAR} and check the obligations page`, async () => {
        await chooseYearPage.selectYear(YEAR)
        await chooseYearPage.clickContinue()
        await obligationsPage.expectLoadedForYear(YEAR)
      })
      await test.step('open the CDP PRNs list for the selected year', async () => {
        await page.goto(prnsUrl.toString())
      })
    } else {
      await reportSkippedSteps(
        'Azure account home and choose a year',
        'unavailable in the CDP-only pipeline; entered the prns page directly for ' +
          YEAR
      )
    }

    await test.step('check the CDP PRNs list and the returned PRN values', async () => {
      await prnsListPage.expectLoaded()
      await prnsListPage.expectPrnVisible(expectedPrn)
    })
  })
})
