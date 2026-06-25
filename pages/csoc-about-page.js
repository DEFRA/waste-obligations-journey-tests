import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

export class CsocAboutPage extends BasePage {
  constructor(page) {
    super(page)
    this.heading = page.getByRole('heading', {
      name: /About your \d{4} certificate of compliance/i
    })
    this.continueButton = page.getByRole('button', { name: /^continue$/i })
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible()
  }

  async expectRegulatorEmail() {
    await this.expectMailtoLinkPopulated()
  }

  async clickContinue() {
    await this.continueButton.click()
  }
}
