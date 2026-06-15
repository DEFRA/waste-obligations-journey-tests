import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

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
    this.viewCertificateLink = page.getByRole('link', {
      name: /view your certificate of compliance/i
    })
    this.resubmitButton = page.getByRole('button', {
      name: /resubmit/i
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

  async openCertificateHub(expectedId) {
    await expect(this.viewCertificateLink).toHaveAttribute(
      'href',
      new RegExp(`/compliance/${escapeRegExp(expectedId)}/certificate`)
    )
    await this.viewCertificateLink.click()
  }

  async expectResubmitCardVisible() {
    await expect(this.resubmitButton).toBeVisible()
    await expect(this.viewCertificateLink).toHaveCount(0)
  }

  async readObligationsTable() {
    return this.readGovukTable(this.materialObligationsTable)
  }
}
