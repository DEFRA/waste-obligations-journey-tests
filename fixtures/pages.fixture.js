import { test as base, expect } from '@playwright/test'
import { LandingPage } from '../pages/landing-page.js'
import { ObligationsPage } from '../pages/obligations-page.js'
import { CsocAboutPage } from '../pages/csoc-about-page.js'
import { CsocSubmissionPage } from '../pages/csoc-submission-page.js'
import { CsocConfirmationPage } from '../pages/csoc-confirmation-page.js'
import { CsocViewPage } from '../pages/csoc-view-page.js'

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
  csocConfirmationPage: async ({ page }, use) => {
    await use(new CsocConfirmationPage(page))
  },
  csocViewPage: async ({ page }, use) => {
    await use(new CsocViewPage(page))
  }
})

export { expect }
