import { test as setup, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireEnv } from '../utils/env.js'
import { signInThroughB2C } from '../utils/login.js'
import {
  getJourneyStartPath,
  usesPackagingEntryPoint
} from '../utils/journey-entry-point.js'
import { establishProxySession } from '../utils/proxy-session.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Where sign-in lands: Account home through the Packaging sign-in, or the CSoC page when entering CDP directly.
const LANDING_HEADING = usesPackagingEntryPoint()
  ? 'Account home -'
  : /About your \d{4} certificate of compliance/i

const authFile = path.join(__dirname, '..', 'playwright', '.auth', 'dp.json')

setup('authenticate', async ({ page }) => {
  // Sign-in plus the proxy session hop each allow up to 60s per step, so the
  // default 60s test timeout would expire before storageState is saved.
  setup.setTimeout(240_000)

  const email = requireEnv('EPR_USER_EMAIL')
  const password = requireEnv('EPR_USER_PASSWORD')

  await page.goto(getJourneyStartPath('dp'), { timeout: 60_000 })

  await signInThroughB2C(page, email, password)

  await expect(
    page.getByRole('heading', { name: LANDING_HEADING })
  ).toBeVisible({ timeout: 60_000 })

  await establishProxySession(page, 'dp')

  await page.context().storageState({ path: authFile })
})
