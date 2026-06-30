import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

export class CsocConfirmationPage extends BasePage {
  constructor(page) {
    super(page)
    this.viewCertificateButton = page.getByRole('button', {
      name: /^view your certificate$/i
    })
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
    await this.viewCertificateButton.click()
  }
}
