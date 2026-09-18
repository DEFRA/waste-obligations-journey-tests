import { test as base, expect } from '@playwright/test'
import { logJourney } from '../utils/journey-log.js'
import { LandingPage } from '../pages/landing-page.js'
import { ChooseYearPage } from '../pages/choose-year-page.js'
import { ObligationsPage } from '../pages/obligations-page.js'
import { PrnsListPage } from '../pages/prns-list-page.js'
import { CsocAboutPage } from '../pages/csoc-about-page.js'
import { CsocSubmissionPage } from '../pages/csoc-submission-page.js'
import { CsocCertificateHubPage } from '../pages/csoc-certificate-hub-page.js'
import { CsocConfirmationPage } from '../pages/csoc-confirmation-page.js'
import { CsocViewPage } from '../pages/csoc-view-page.js'

export const test = base.extend({
  page: async ({ page, baseURL }, use, testInfo) => {
    const target = new URL(baseURL)
    process.stdout.write('\n\n')
    logJourney(testInfo, 'START')
    logJourney(testInfo, `Target: ${target.origin}${target.pathname}`)

    const logNavigation = (frame) => {
      if (frame !== page.mainFrame()) return
      const url = new URL(frame.url())
      if (url.origin === target.origin) {
        logJourney(testInfo, `Page: ${url.pathname}`)
      }
    }

    page.on('framenavigated', logNavigation)
    try {
      await use(page)
    } finally {
      page.off('framenavigated', logNavigation)
      logJourney(testInfo, 'END')
      process.stdout.write('\n\n')
    }
  },
  landingPage: async ({ page }, use) => {
    await use(new LandingPage(page))
  },
  chooseYearPage: async ({ page }, use) => {
    await use(new ChooseYearPage(page))
  },
  obligationsPage: async ({ page }, use) => {
    await use(new ObligationsPage(page))
  },
  prnsListPage: async ({ page }, use) => {
    await use(new PrnsListPage(page))
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
  }
})

export { expect }
