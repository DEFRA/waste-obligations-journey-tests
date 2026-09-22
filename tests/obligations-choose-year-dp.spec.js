import { test } from '../fixtures/pages.fixture.js'
import { requireEnv } from '../utils/env.js'
import { submitB2CCredentials } from '../utils/login.js'
import {
  getJourneyStartPath,
  usesPackagingEntryPoint
} from '../utils/journey-entry-point.js'
import { reportSkippedSteps } from '../utils/skipped-steps.js'

const YEAR = 2026

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Manage recycling obligations - certificate for a year (DP)', () => {
  test('log in and view the certificate of compliance for the requested year', async ({
    page,
    landingPage,
    chooseYearPage,
    obligationsPage,
    csocAboutPage
  }) => {
    const packaging = usesPackagingEntryPoint()
    await test.step('open the entry point and sign in as the producer', async () => {
      await page.goto(getJourneyStartPath('dp', YEAR), { timeout: 60_000 })
      await submitB2CCredentials(
        page,
        requireEnv('EPR_USER_EMAIL'),
        requireEnv('EPR_USER_PASSWORD')
      )
    })

    if (packaging) {
      await landingPage.expectLoaded()
      if (await landingPage.hasYearSelection()) {
        await test.step('open year selection from Azure account home', async () => {
          await landingPage.goToChooseYear()
          await chooseYearPage.expectLoaded()
        })
        await test.step(`select ${YEAR} and check the obligations page`, async () => {
          await chooseYearPage.selectYear(YEAR)
          await chooseYearPage.clickContinue()
          await obligationsPage.expectLoadedForYear(YEAR)
        })
      } else {
        await reportSkippedSteps(
          'Azure choose a year',
          'account home shows the single-year obligations link on this environment'
        )
        await test.step('open obligations from Azure account home', async () => {
          await landingPage.goToObligations()
          await obligationsPage.expectLoaded()
        })
      }
      await test.step('open the certificate hub', async () => {
        await obligationsPage.openCertificateHub()
      })
    } else {
      await reportSkippedSteps(
        'Azure account home, choose a year and open the certificate hub',
        'unavailable in the CDP-only pipeline; entered the certificate page directly for ' +
          YEAR
      )
    }

    await test.step('check the certificate for the requested year', async () => {
      await csocAboutPage.expectLoadedForYear(YEAR)
    })
  })
})
