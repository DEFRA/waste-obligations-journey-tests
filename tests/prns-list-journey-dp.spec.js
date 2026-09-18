import { test } from '../fixtures/pages.fixture.js'
import { requireEnv } from '../utils/env.js'
import { submitB2CCredentials } from '../utils/login.js'
import {
  getJourneyStartPath,
  usesPackagingEntryPoint,
  getProducerPrnsUrl
} from '../utils/journey-entry-point.js'
import { reportSkippedSteps } from '../utils/skipped-steps.js'

const YEAR = 2026

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Producer PRNs list (DP)', () => {
  test('log in and view the PRNs list for the requested year', async ({
    page,
    landingPage,
    chooseYearPage,
    obligationsPage,
    prnsListPage
  }) => {
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

    await test.step('check the CDP PRNs list', async () => {
      await prnsListPage.expectLoaded()
    })
  })
})
