import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

export class CsocCertificateHubPage extends BasePage {
  constructor(page) {
    super(page)
    this.viewConfirmationLink = page.getByRole('link', {
      name: /view confirmation/i
    })
  }

  async expectLoaded() {
    await expect(this.viewConfirmationLink).toBeVisible()
  }

  async goToConfirmation() {
    await this.viewConfirmationLink.click()
  }
}
