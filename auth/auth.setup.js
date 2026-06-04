import { test as setup, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authFile = path.join(__dirname, '..', 'playwright', '.auth', 'user.json')

setup('authenticate', async ({ page }) => {
  const email = process.env.EPR_USER_EMAIL
  const password = process.env.EPR_USER_PASSWORD

  if (!email || !password) {
    throw new Error(
      'EPR_USER_EMAIL and EPR_USER_PASSWORD must be set in the environment (see .env.example).'
    )
  }

  // https://rwd-dev9.azure.defra.cloud/create-account
  await page.goto('/create-account', { timeout: 60_000 })

  // The B2C flow can resolve in two ways:
  //   - straight to the login form on b2clogin.com
  //   - back to /report-data/error (e.g. UX004) requiring a "Sign in" click
  // Wait for the redirect chain to settle, then branch on URL.
  await page.waitForLoadState('networkidle')

  if (page.url().includes('/error')) {
    await page.getByRole('link', { name: /sign in/i }).click()
  }

  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in|continue|next/i }).click()

  await expect(
    page.getByRole('heading', { name: 'Account home -' })
  ).toBeVisible({ timeout: 60_000 })

  await page.context().storageState({ path: authFile })
})
