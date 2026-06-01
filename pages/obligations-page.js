import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

export class ObligationsPage extends BasePage {
  constructor(page) {
    super(page)
    this.path = '/report-data/manage-your-recycling-obligations'
    this.heading = page.getByRole('heading', {
      name: /manage your \d{4} recycling/i
    })
    this.submitCertificateButton = page.getByRole('button', {
      name: /submit (certificate|statement)/i
    })
    this.materialObligationsTable = page
      .locator('table.govuk-table')
      .filter({
        has: page.getByRole('columnheader', {
          name: /Recycling obligations to meet/i
        })
      })
      .first()
  }

  async goto() {
    await this.gotoPath(this.path)
    await this.expectLoaded()
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible()
  }

  async startCsocSubmission() {
    await this.submitCertificateButton.click()
  }

  async readObligationsTable() {
    return this.readGovukTable(this.materialObligationsTable)
  }
}
