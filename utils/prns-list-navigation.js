import { expect, test } from '@playwright/test'
import { requireEnv } from './env.js'
import { submitB2CCredentials } from './login.js'
import {
  getProducerPrnsUrl,
  getWasteObligationsFrontendBaseUrl
} from './journey-entry-point.js'
import { skipUnlessPrnsEnabled } from './environment-features.js'

function producerPrnsListUrl(year) {
  return new URL(
    getProducerPrnsUrl(year).toString(),
    getWasteObligationsFrontendBaseUrl()
  ).toString()
}

async function expectPrnsListLoaded(prnsListPage) {
  await skipUnlessPrnsEnabled(prnsListPage)

  await test.step('check the PRNs page loads', async () => {
    await prnsListPage.expectLoaded()
  })
}

// Signs in as the producer and lands on the PRNs list for `year`. Extracted
// from the main DP PRNs journey so other DP PRNs-list specs (e.g. sort/filter)
// can reach the same starting point without duplicating the entry-point and
// feature-flag branching.
export async function openProducerPrnsList({ page, prnsListPage }, year) {
  await test.step('open the entry point', async () => {
    await page.goto(producerPrnsListUrl(year), { timeout: 60_000 })
  })

  await test.step('sign in as the producer', async () => {
    await submitB2CCredentials(
      page,
      requireEnv('EPR_USER_EMAIL'),
      requireEnv('EPR_USER_PASSWORD')
    )
  })

  await expectPrnsListLoaded(prnsListPage)
}

// Opens the PRNs list for `year` with the storageState saved by auth.setup.js.
// It never signs in: a sign-in form means the saved session was rejected,
// which must fail rather than silently repeat the login.
export async function openAuthenticatedProducerPrnsList(
  { page, prnsListPage },
  year
) {
  await test.step('open the PRNs list with the saved session', async () => {
    await page.goto(producerPrnsListUrl(year), { timeout: 60_000 })
    await page.waitForLoadState('networkidle')

    expect(
      page.url(),
      'The saved DP session was not accepted: the PRNs list redirected to sign-in.'
    ).not.toMatch(/b2clogin|signin-oidc/)
    await expect(
      page.getByLabel(/email/i),
      'The saved DP session was not accepted: the PRNs list showed a sign-in form.'
    ).toHaveCount(0)
  })

  await expectPrnsListLoaded(prnsListPage)
}
