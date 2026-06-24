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
      name: /submit your (certificate|statement)/i
    })
    this.viewCertificateButton = page.getByRole('button', {
      name: /view your certificate of compliance/i
    })
    this.resubmitButton = page.getByRole('button', {
      name: /resubmit/i
    })
    // Filter by a cell's data-header attribute rather than `getByRole('columnheader')`:
    // the responsive-table CSS hides <thead> on mobile, removing th columnheader roles.
    this.materialObligationsTable = page
      .locator('table.govuk-table')
      .filter({
        has: page.locator('td[data-header="Recycling obligations to meet"]')
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

  async openCertificateHub() {
    await this.viewCertificateButton.click()
  }

  async expectResubmitCardVisible() {
    await expect(this.resubmitButton).toBeVisible()
    await expect(this.viewCertificateButton).toHaveCount(0)
  }

  async readObligationsTable() {
    return this.readGovukTable(this.materialObligationsTable)
  }
}
