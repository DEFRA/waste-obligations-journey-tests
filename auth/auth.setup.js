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

  await page.goto('/report-data/error')
  await page.getByRole('link', { name: 'Sign in' }).click()

  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in|continue|next/i }).click()

  await expect(
    page.getByRole('heading', { name: 'Account home -' })
  ).toBeVisible({ timeout: 30_000 })

  await page.context().storageState({ path: authFile })
})
