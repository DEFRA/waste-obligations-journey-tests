'use strict'

const { chromium } = require('@playwright/test')
const { FRONTEND_BASE } = require('../config')

async function openBrowser({ headed = true } = {}) {
  const browser = await chromium.launch({
    headless: !headed,
    slowMo: headed ? 100 : 0
  })
  const context = await browser.newContext({
    baseURL: FRONTEND_BASE,
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 }
  })
  const page = await context.newPage()
  return { browser, context, page, baseURL: FRONTEND_BASE }
}

// The mock B2C picker (https://localhost:8443) renders one <button name="b2cmock_user" value="<userId>"> per seeded user.
// If B2CMOCK_AUTO_SELECT_USER_ID is set in the local env .env, the picker is skipped and that user is signed in instead.
async function signIn(page, userId) {
  await page.goto('/report-data', { waitUntil: 'domcontentloaded' })
  if (page.url().includes(':8443')) {
    await page.locator(`button[name="b2cmock_user"][value="${userId}"]`).click()
  }
  await page.waitForURL(/:7084\/report-data\/home/, { timeout: 30000 })
  await page.waitForLoadState('networkidle')
  await acceptCookies(page)
}

async function acceptCookies(page) {
  const btn = page
    .getByRole('button', { name: /accept (additional|analytics)? ?cookies/i })
    .first()
  if (await btn.count()) {
    await btn.click().catch(() => {})
    const hide = page
      .getByRole('button', { name: /hide (this )?(cookie )?message/i })
      .first()
    if (await hide.count()) await hide.click().catch(() => {})
  }
}

// The language toggle is a link to /report-data/culture?culture=cy&returnUrl=...; ?culture= on other pages is ignored.
async function setLanguage(page, lang) {
  const returnUrl =
    '~' + new URL(page.url()).pathname.replace(/^\/report-data/, '')
  await page.goto(
    `/report-data/culture?culture=${lang}&returnUrl=${encodeURIComponent(returnUrl)}`,
    { waitUntil: 'domcontentloaded' }
  )
}

module.exports = { openBrowser, signIn, acceptCookies, setLanguage }
