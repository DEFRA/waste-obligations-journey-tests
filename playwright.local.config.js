import 'dotenv/config'
import { defineConfig } from '@playwright/test'
import baseConfig from './playwright.config.js'

export default defineConfig({
  ...baseConfig,
  workers: 1,
  retries: 0,
  use: {
    ...baseConfig.use,
    baseURL: process.env.EPR_BASE_URL || 'https://localhost:7084',
    trace: 'on',
    video: 'on'
  }
})
