import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

export class CsocCertificateHubPage extends BasePage {
  constructor(page) {
    super(page)
    this.viewConfirmationButton = page.getByRole('button', {
      name: /view confirmation/i
    })
  }

  async expectLoaded() {
    await expect(this.viewConfirmationButton).toBeVisible()
  }

  async goToConfirmation() {
    await this.viewConfirmationButton.click()
  }
}
