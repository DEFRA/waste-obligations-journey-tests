import 'dotenv/config'
import { defineConfig, devices } from '@playwright/test'

const baseURL =
  process.env.ENVIRONMENT === 'dev'
    ? 'https://rwd-dev9.azure.defra.cloud'
    : 'https://rwd-tst1.azure.defra.cloud'
const proxy = process.env.HTTP_PROXY
  ? { server: process.env.HTTP_PROXY }
  : undefined

const AUTH_STATE = 'playwright/.auth/user.json'

const galaxyS23Ultra = {
  userAgent:
    'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
  defaultBrowserType: 'chromium'
}

const iPhone15ProMax = {
  ...devices['iPhone 14 Pro Max'],
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 3
}

export default defineConfig({
  testDir: './tests',
  // Accessibility specs are opt-in. Default runs (`npm test`, `npm run test:local`)
  // skip them; the dedicated `test:*:accessibility` scripts set RUN_ACCESSIBILITY=1.
  testIgnore: process.env.RUN_ACCESSIBILITY ? [] : ['**/accessibility.spec.js'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['allure-playwright', { resultsDir: 'allure-results' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: 'on',
    screenshot: { mode: 'only-on-failure', fullPage: true },
    video: 'on',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      proxy
    }
  },
  projects: [
    {
      name: 'setup',
      testDir: './auth',
      testMatch: /.*\.setup\.js/,
      use: { video: 'on' }
    },
    {
      name: 'chrome-mac',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        storageState: AUTH_STATE
      },
      dependencies: ['setup']
    },
    {
      name: 'chrome-windows',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        storageState: AUTH_STATE
      },
      dependencies: ['setup']
    },
    {
      name: 'edge-windows',
      use: {
        ...devices['Desktop Edge'],
        channel: 'msedge',
        storageState: AUTH_STATE
      },
      dependencies: ['setup']
    },
    {
      name: 'safari-mac',
      use: {
        ...devices['Desktop Safari'],
        storageState: AUTH_STATE
      },
      dependencies: ['setup']
    },
    {
      name: 'chrome-android',
      use: {
        ...galaxyS23Ultra,
        storageState: AUTH_STATE
      },
      dependencies: ['setup']
    },
    {
      name: 'safari-ios',
      use: {
        ...iPhone15ProMax,
        storageState: AUTH_STATE
      },
      dependencies: ['setup']
    }
  ]
})
