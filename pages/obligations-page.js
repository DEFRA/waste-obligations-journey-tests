import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

export class ObligationsPage extends BasePage {
  constructor(page) {
    super(page)
    this.path = '/report-data/manage-your-recycling-obligations'
    this.heading = page.getByRole('heading', {
      name: /manage your \d{4} recycling/i
    })
    this.submitStatementButton = page.getByRole('button', {
      name: 'Submit statement'
    })
    this.viewSubmittedStatementLink = page
      .getByRole('link', {
        name: /view.*statement|submitted.*statement|view.*csoc/i
      })
      .or(page.getByRole('link', { name: /view submitted/i }))
  }

  async goto() {
    await this.gotoPath(this.path)
    await this.expectLoaded()
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible()
  }

  async startCsocSubmission() {
    await this.submitStatementButton.click()
  }

  async openSubmittedCsoc() {
    await this.viewSubmittedStatementLink.first().click()
  }
}
