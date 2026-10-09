// Browser session for testing a ticket on LOCAL, dev9 or tst: the environment's URLs, the account to sign in as,
// and sign-in through mock B2C (LOCAL) or real B2C (dev9, tst). Passwords are read from the matrix or .env and are
// never printed.
//
//   import { openSession } from '<repo>/.claude/skills/qa-ticket/lib/session.mjs'
//   const { page, close, account } = await openSession({ env: 'tst', account: 'matrix:EA:DRP' })
//
// Account specs:
//   local:<DRP|CS>:<AP|DP|BU>   LOCAL mock B2C users (POP QUEST LTD / Organisation Name)
//   matrix:<EA|NRW|SEPA|NIEA>:<DRP|CS>   the csoc-e2e tst matrix accounts
//   env:<PREFIX>                <PREFIX>_EMAIL and <PREFIX>_PASSWORD from .env (e.g. env:EPR_USER, env:DEV9_DRP)

import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import dotenv from 'dotenv'

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..'
)
dotenv.config({ path: path.join(REPO_ROOT, '.env'), quiet: true })
const require = createRequire(import.meta.url)

// packaging: the Packaging frontend (sign-in, account home, RPD PRN pages under /report-data).
// cdp: the Waste Obligations frontend; in a browser it is reached through Packaging's links (packaging-waste-proxy).
// api: the waste-obligations backend (use utils/waste-obligations-api.js for authenticated calls).
export const ENVIRONMENTS = {
  local: {
    packaging: 'https://localhost:7084',
    cdp: 'https://localhost:8015/manage-recycling-obligations/',
    api: 'http://localhost:8007'
  },
  dev9: {
    packaging: 'https://rwd-dev9.azure.defra.cloud',
    cdp: 'https://waste-obligations.dev.cdp-int.defra.cloud',
    api: 'https://waste-obligations.api.dev.cdp-int.defra.cloud'
  },
  tst: {
    packaging: 'https://rwd-tst1.azure.defra.cloud',
    cdp: 'https://waste-obligations.test.cdp-int.defra.cloud',
    api: 'https://ephemeral-protected.api.test.cdp-int.defra.cloud/waste-obligations'
  }
}

export async function resolveAccount(spec, env) {
  const [kind, a, b] = String(spec).split(':')
  if (kind === 'local') {
    if (env !== 'local') throw new Error(`${spec} only works on LOCAL`)
    const { userFor } = require('../../mydw-e2e/local/config.js')
    const user = userFor(a, b)
    return { label: `LOCAL ${a} ${b}`, mockUserId: user.userId }
  }
  if (kind === 'matrix') {
    const { matrix } = await import('../../csoc-e2e/data/matrix.js')
    const entry = matrix[a] && matrix[a][b]
    if (!entry) throw new Error(`no matrix account ${a} ${b}`)
    return {
      label: `${a} ${b} (${entry.companyName})`,
      email: entry.username,
      password: entry.password,
      organisationId: entry.organisationId,
      complianceSchemeId: entry.complianceSchemeId
    }
  }
  if (kind === 'env') {
    const email = process.env[`${a}_EMAIL`]
    const password = process.env[`${a}_PASSWORD`]
    if (!email || !password)
      throw new Error(`${a}_EMAIL and ${a}_PASSWORD must be set in .env`)
    return { label: `${a} account`, email, password }
  }
  throw new Error(`unknown account spec ${spec}`)
}

export async function signIn(page, account) {
  await page.goto('/report-data', { timeout: 90_000 })
  if (account.mockUserId) {
    if (page.url().includes(':8443')) {
      await page
        .locator(`button[name="b2cmock_user"][value="${account.mockUserId}"]`)
        .click({ noWaitAfter: true })
    }
  } else {
    await page.waitForLoadState('networkidle')
    if (page.url().includes('error')) {
      await page.getByRole('link', { name: /sign in/i }).click()
    }
    await page.getByLabel(/email/i).fill(account.email)
    await page.getByLabel(/password/i).fill(account.password)
    await page.getByRole('button', { name: /sign in|continue|next/i }).click()
  }
  await page
    .getByRole('heading', { name: /^Account home/ })
    .waitFor({ timeout: 90_000 })
  const accept = page.getByRole('button', { name: /accept analytics cookies/i })
  if (await accept.count()) {
    await accept.click()
    const hide = page.getByRole('button', {
      name: /hide (this )?(cookie )?message/i
    })
    if (await hide.count()) await hide.first().click()
  }
}

export async function openSession({ env, account, headed = true }) {
  const urls = ENVIRONMENTS[env]
  if (!urls) throw new Error(`unknown environment ${env} (local, dev9, tst)`)
  const resolved = await resolveAccount(account, env)
  const browser = await chromium.launch({ headless: !headed })
  const context = await browser.newContext({
    baseURL: urls.packaging,
    ignoreHTTPSErrors: env === 'local',
    viewport: { width: 1280, height: 900 }
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)
  page.setDefaultNavigationTimeout(60_000)
  await signIn(page, resolved)
  return {
    page,
    context,
    urls,
    account: { label: resolved.label },
    close: () => browser.close()
  }
}
