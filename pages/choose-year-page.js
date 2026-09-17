import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

export class ChooseYearPage extends BasePage {
  constructor(page) {
    super(page)
    this.heading = page.getByRole('heading', {
      name: /^choose a year$/i,
      level: 1
    })
    this.continueButton = page.getByRole('button', { name: /^continue$/i })
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible()
  }

  async selectYear(year) {
    await this.page
      .getByRole('radio', { name: String(year), exact: true })
      .check()
  }

  async clickContinue() {
    await this.continueButton.click()
  }
}
