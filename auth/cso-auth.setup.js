import { test as setup, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireEnv } from '../utils/env.js'
import {
  getJourneyStartPath,
  usesPackagingEntryPoint
} from '../utils/journey-entry-point.js'
import { establishProxySession } from '../utils/proxy-session.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Where sign-in lands: Account home through the Packaging sign-in, or the CSoC page when entering CDP directly.
const LANDING_HEADING = usesPackagingEntryPoint()
  ? 'Account home -'
  : /About your \d{4} statement of compliance/i

const authFile = path.join(__dirname, '..', 'playwright', '.auth', 'cso.json')

setup('authenticate cso', async ({ page }) => {
  // Sign-in plus the proxy session hop each allow up to 60s per step, so the
  // default 60s test timeout would expire before storageState is saved.
  setup.setTimeout(240_000)

  const email = requireEnv('EPR_CSO_USER_EMAIL')
  const password = requireEnv('EPR_CSO_USER_PASSWORD')

  await page.goto(getJourneyStartPath('cso'), { timeout: 60_000 })

  // The B2C flow can resolve in two ways:
  //   - straight to the login form on b2clogin.com
  //   - back to /report-data/error (e.g. UX004) requiring a "Sign in" click
  // Wait for either, then branch on URL.
  await page
    .getByLabel(/email/i)
    .or(page.getByRole('link', { name: /sign in/i }))
    .first()
    .waitFor({ timeout: 60_000 })

  // eslint-disable-next-line playwright/no-conditional-in-test -- B2C sometimes routes via the app's error page
  if (page.url().includes('error')) {
    await page.getByRole('link', { name: /sign in/i }).click()
  }

  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in|continue|next/i }).click()

  await expect(
    page.getByRole('heading', { name: LANDING_HEADING })
  ).toBeVisible({ timeout: 60_000 })

  await establishProxySession(page, 'cso')

  await page.context().storageState({ path: authFile })
})
