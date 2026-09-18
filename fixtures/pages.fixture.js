import { test as base, expect } from '@playwright/test'
import { LandingPage } from '../pages/landing-page.js'
import { ObligationsPage } from '../pages/obligations-page.js'
import { CsocAboutPage } from '../pages/csoc-about-page.js'
import { CsocSubmissionPage } from '../pages/csoc-submission-page.js'
import { CsocCertificateHubPage } from '../pages/csoc-certificate-hub-page.js'
import { CsocConfirmationPage } from '../pages/csoc-confirmation-page.js'
import { CsocViewPage } from '../pages/csoc-view-page.js'
import { recorderFromEnv } from '../utils/screenshot-recorder.js'

export const test = base.extend({
  landingPage: async ({ page }, use) => {
    await use(new LandingPage(page))
  },
  obligationsPage: async ({ page }, use) => {
    await use(new ObligationsPage(page))
  },
  csocAboutPage: async ({ page }, use) => {
    await use(new CsocAboutPage(page))
  },
  csocSubmissionPage: async ({ page }, use) => {
    await use(new CsocSubmissionPage(page))
  },
  csocCertificateHubPage: async ({ page }, use) => {
    await use(new CsocCertificateHubPage(page))
  },
  csocConfirmationPage: async ({ page }, use) => {
    await use(new CsocConfirmationPage(page))
  },
  csocViewPage: async ({ page }, use) => {
    await use(new CsocViewPage(page))
  },
  // eslint-disable-next-line no-empty-pattern
  screenshotRecorder: async ({}, use) => {
    // No-op when EVIDENCE_DIR is not set — regular test runs are unaffected.
    const recorder = await recorderFromEnv('producer')
    await use(recorder)
  }
})

export { expect }
