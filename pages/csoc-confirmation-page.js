import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

export class CsocConfirmationPage extends BasePage {
  constructor(page) {
    super(page)
    // Confirmation page renders "View your certificate" for DRP and
    // "View your statement" for CS. Match either via a single locator so
    // callers don't have to branch on org type.
    this.viewCertificateButton = page.getByRole('button', {
      name: /^view your (certificate|statement)$/i
    })
    // Fallback — some FE versions render the CTA as a link rather than a
    // button. `.or(...)` matches whichever exists on the current page.
    this.viewCertificateLink = page.getByRole('link', {
      name: /^view your (certificate|statement)$/i
    })
  }

  get viewCertificateCta() {
    return this.viewCertificateButton.or(this.viewCertificateLink)
  }

  headingFor(year) {
    return this.page.getByRole('heading', {
      name: new RegExp(`${year} (certificate|statement) of compliance`, 'i')
    })
  }

  async expectSubmitted(year) {
    await expect(this.headingFor(year)).toBeVisible()
  }

  async goToCertificateView() {
    await this.viewCertificateCta.click()
  }
}
