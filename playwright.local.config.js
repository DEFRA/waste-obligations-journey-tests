import 'dotenv/config'
import { defineConfig } from '@playwright/test'
import baseConfig from './playwright.config.js'
import { getJourneyBaseUrl } from './utils/journey-entry-point.js'

export default defineConfig({
  ...baseConfig,
  workers: 1,
  retries: 0,
  use: {
    ...baseConfig.use,
    baseURL: getJourneyBaseUrl('local'),
    trace: 'on',
    video: 'on'
  }
})
