import { test, expect } from '@playwright/test'
import { requireEnv } from './env.js'
import { submitB2CCredentials } from './login.js'
import { getJourneyStartPath } from './journey-entry-point.js'

// Shared by every spec that needs to get from a signed-out browser, through
// JOURNEY_USER login and the multi-year "Choose a year" step, to a loaded
// certificate-of-compliance "about" page - the common entry point for both
// the choose-year journey itself and anything that continues on from it
// (e.g. the PRNs list). Only reachable via the packaging entry point.
export async function loginAsJourneyUserAndChooseYear(
  { page, landingPage, chooseYearPage, obligationsPage, csocAboutPage },
  { account = 'dp', year } = {}
) {
  const email = requireEnv('JOURNEY_USER')
  const password = requireEnv('JOURNEY_PASSWORD')

  await test.step('login as JOURNEY_USER', async () => {
    await page.goto(getJourneyStartPath(account), { timeout: 60_000 })
    await submitB2CCredentials(page, email, password)

    // Verifies login success before continuing the journey.
    await expect(
      page.getByRole('heading', { name: 'Account home -' })
    ).toBeVisible({ timeout: 60_000 })
  })

  await landingPage.goToChooseYear()

  await chooseYearPage.expectLoaded()
  await chooseYearPage.selectYear(year)
  await chooseYearPage.clickContinue()

  await obligationsPage.expectLoadedForYear(year)

  await obligationsPage.openCertificateHub()

  await csocAboutPage.expectLoadedForYear(year)
}
