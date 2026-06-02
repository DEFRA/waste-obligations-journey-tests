import 'dotenv/config'
import { defineConfig, devices } from '@playwright/test'

const baseURL =
  process.env.ENVIRONMENT === 'dev'
    ? 'https://rwd-dev9.azure.defra.cloud'
    : 'https://rwd-tst1.azure.defra.cloud'

export default defineConfig({
  testDir: './tests',
  globalSetup: './globalSetup.js',
  // Accessibility specs are opt-in. Default runs (`npm test`, `npm run test:local`)
  // skip them; the dedicated `test:*:accessibility` scripts set RUN_ACCESSIBILITY=1.
  testIgnore: process.env.RUN_ACCESSIBILITY ? [] : ['**/accessibility.spec.js'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['allure-playwright', { resultsDir: 'allure-results' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    proxy: {
      server: process.env.CDP_HTTPS_PROXY
    },
    launchOptions: {
      args: ['--disable-http2']
    },
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    viewport: { width: 1280, height: 720 }
  },
  projects: [
    {
      name: 'setup',
      testDir: './auth',
      testMatch: /.*\.setup\.js/
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json'
      },
      dependencies: ['setup']
    }
  ]
})
