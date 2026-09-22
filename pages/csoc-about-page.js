import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'
import { isLocatorVisible } from '../utils/environment-features.js'

export class CsocAboutPage extends BasePage {
  constructor(page) {
    super(page)
    this.heading = page.getByRole('heading', {
      name: /About your \d{4} (certificate|statement) of compliance/i
    })
    this.continueButton = page.getByRole('button', { name: /^continue$/i })
  }

  async isAvailable() {
    return isLocatorVisible(this.heading)
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible()
  }

  headingFor(year) {
    return this.page.getByRole('heading', {
      name: new RegExp(`${year} (certificate|statement) of compliance`, 'i')
    })
  }

  async expectLoadedForYear(year) {
    await expect(this.headingFor(year)).toBeVisible()
  }

  async expectRegulatorEmail() {
    await this.expectMailtoLinkPopulated()
  }

  async clickContinue() {
    await this.continueButton.click()
  }

  async expectCanSubmit() {
    await expect(this.continueButton).toBeVisible()
  }
}
