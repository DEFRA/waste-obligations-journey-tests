import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'
import { REGULATOR_EMAIL } from '../data/csoc.data.js'

export class CsocAboutPage extends BasePage {
  constructor(page) {
    super(page)
    this.heading = page.getByRole('heading', {
      name: /About your \d{4} certificate of compliance/i
    })
    this.continueButton = page.getByRole('button', { name: /^continue$/i })
    this.regulatorEmailLink = page.getByRole('link', { name: REGULATOR_EMAIL })
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible()
  }

  async expectRegulatorEmail() {
    await expect(this.regulatorEmailLink.first()).toBeVisible()
  }

  async clickContinue() {
    await this.continueButton.click()
  }
}
