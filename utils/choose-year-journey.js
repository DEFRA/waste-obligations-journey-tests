import { test, expect } from '@playwright/test'
import { requireEnv } from './env.js'
import { submitB2CCredentials } from './login.js'
import {
  getJourneyStartPath,
  usesPackagingEntryPoint
} from './journey-entry-point.js'

// Shared by every spec that needs to get from a signed-out browser, through
// EPR_USER_EMAIL login and the multi-year "Choose a year" step, to a loaded
// certificate-of-compliance "about" page - the common entry point for both
// the choose-year journey itself and anything that continues on from it
// (e.g. the PRNs list). Direct entry opens the same certificate without Azure
// navigation, while retaining the explicit producer login and year assertion.
export async function loginAsProducerAndOpenCertificate(
  { page, landingPage, chooseYearPage, obligationsPage, csocAboutPage },
  { account = 'dp', year } = {}
) {
  const email = requireEnv('EPR_USER_EMAIL')
  const password = requireEnv('EPR_USER_PASSWORD')

  await test.step('login as EPR_USER_EMAIL', async () => {
    await page.goto(getJourneyStartPath(account, year), { timeout: 60_000 })
    await submitB2CCredentials(page, email, password)

    if (usesPackagingEntryPoint()) {
      await expect(
        page.getByRole('heading', { name: 'Account home -' })
      ).toBeVisible({ timeout: 60_000 })
    }
  })

  const azureStep =
    'Azure account home, choose a year and open the certificate hub'
  if (usesPackagingEntryPoint()) {
    await test.step(azureStep, async () => {
      await landingPage.goToChooseYear()
      await chooseYearPage.expectLoaded()
      await chooseYearPage.selectYear(year)
      await chooseYearPage.clickContinue()
      await obligationsPage.expectLoadedForYear(year)
      await obligationsPage.openCertificateHub()
    })
  } else {
    process.stdout.write(
      `[journey] SKIPPED STEPS: ${azureStep} — unavailable at the waste-obligations entry point. Continuing with certificate and downstream checks for ${year}.\n`
    )
    await test.step.skip(azureStep, async () => {})
  }

  await csocAboutPage.expectLoadedForYear(year)
}
