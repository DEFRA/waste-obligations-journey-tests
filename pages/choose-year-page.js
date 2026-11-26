import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'
import {
  getObligationsChooseYearUrl,
  getWasteObligationsFrontendBaseUrl
} from '../utils/journey-entry-point.js'

export class ChooseYearPage extends BasePage {
  constructor(page) {
    super(page)
    this.heading = page.getByRole('heading', {
      name: /^choose a year$/i,
      level: 1
    })
    this.continueButton = page.getByRole('button', { name: /^continue$/i })
    this.errorSummary = page.locator('.govuk-error-summary')
  }

  // Opens the CDP page directly, for the producer or the compliance scheme.
  async goto(account) {
    await this.page.goto(
      new URL(
        getObligationsChooseYearUrl(account).toString(),
        getWasteObligationsFrontendBaseUrl()
      ).toString(),
      { timeout: 60_000 }
    )
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

  async expectSelectYearError() {
    await expect(this.errorSummary).toBeVisible()
    await expect(
      this.errorSummary.getByRole('link', { name: 'Select a year' })
    ).toBeVisible()
  }
}
