import { test } from '@playwright/test'
import { requireEnv } from './env.js'
import { submitB2CCredentials } from './login.js'
import {
  getProducerPrnsUrl,
  getWasteObligationsFrontendBaseUrl
} from './journey-entry-point.js'
import { skipUnlessPrnsEnabled } from './environment-features.js'

// Signs in as the producer and lands on the PRNs list for `year`. Extracted
// from the main DP PRNs journey so other DP PRNs-list specs (e.g. sort/filter)
// can reach the same starting point without duplicating the entry-point and
// feature-flag branching.
export async function openProducerPrnsList({ page, prnsListPage }, year) {
  const prnsUrl = getProducerPrnsUrl(year)

  await test.step('open the entry point', async () => {
    const url = new URL(
      prnsUrl.toString(),
      getWasteObligationsFrontendBaseUrl()
    )
    await page.goto(url.toString(), { timeout: 60_000 })
  })

  await test.step('sign in as the producer', async () => {
    await submitB2CCredentials(
      page,
      requireEnv('EPR_USER_EMAIL'),
      requireEnv('EPR_USER_PASSWORD')
    )
  })

  await skipUnlessPrnsEnabled(prnsListPage)

  await test.step('check the PRNs page loads', async () => {
    await prnsListPage.expectLoaded()
  })
}
