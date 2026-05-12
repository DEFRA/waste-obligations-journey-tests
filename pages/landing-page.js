import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

export class LandingPage extends BasePage {
  constructor(page) {
    super(page)
    this.path = '/report-data'
    this.manageObligationsLink = page.getByRole('link', {
      name: /manage your \d{4} recycling/i
    })
  }

  async goto() {
    await this.gotoPath(this.path)
    await this.expectLoaded()
  }

  async expectLoaded() {
    await expect(this.manageObligationsLink).toBeVisible()
  }

  async goToObligations() {
    await this.manageObligationsLink.click()
  }
}
