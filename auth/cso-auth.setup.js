import { test as setup, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireEnv } from '../utils/env.js'
import {
  getJourneyStartPath,
  usesPackagingEntryPoint
} from '../utils/journey-entry-point.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authFile = path.join(__dirname, '..', 'playwright', '.auth', 'cso.json')

setup('authenticate cso', async ({ page }) => {
  const email = requireEnv('EPR_CSO_USER_EMAIL')
  const password = requireEnv('EPR_CSO_USER_PASSWORD')

  await page.goto(getJourneyStartPath('cso'), { timeout: 60_000 })

  // The B2C flow can resolve in two ways:
  //   - straight to the login form on b2clogin.com
  //   - back to /report-data/error (e.g. UX004) requiring a "Sign in" click
  // Wait for the redirect chain to settle, then branch on URL.
  await page.waitForLoadState('networkidle')

  if (page.url().includes('error')) {
    await page.getByRole('link', { name: /sign in/i }).click()
  }

  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in|continue|next/i }).click()

  if (usesPackagingEntryPoint()) {
    await expect(
      page.getByRole('heading', { name: 'Account home -' })
    ).toBeVisible({ timeout: 60_000 })
  } else {
    await expect(
      page.getByRole('heading', {
        name: /About your \d{4} statement of compliance/i
      })
    ).toBeVisible({ timeout: 60_000 })
  }

  await page.context().storageState({ path: authFile })
})
