import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'
import { OBLIGATIONS_MET_STATUS } from '../data/csoc.data.js'

export class CsocSubmissionPage extends BasePage {
  constructor(page) {
    super(page)
    this.heading = page.getByRole('heading', {
      name: /Check and submit your \d{4} certificate of compliance/i
    })
    this.fullNameInput = page.getByLabel(/full name/i)
    this.confirmAndSubmitButton = page.getByRole('button', {
      name: /confirm and submit/i
    })
    this.obligationsMetStatus = page.getByText(OBLIGATIONS_MET_STATUS)
    // Filter by a cell's data-header attribute rather than `getByRole('columnheader')`:
    // the responsive-table CSS hides <thead> on mobile, removing th columnheader roles.
    this.materialObligationsTable = page
      .locator('table.govuk-table')
      .filter({
        has: page.locator('td[data-header="Recycling obligations to meet"]')
      })
      .first()
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible()
  }

  async expectOrganisationDetails() {
    await this.expectFieldPopulated('Organisation name')
    await this.expectFieldPopulated('Address')
    await this.expectFieldPopulated('Regulator')
    await this.expectMailtoLinkPopulated()
  }

  async expectObligationsMet() {
    await expect(this.obligationsMetStatus).toBeVisible()
  }

  async readObligationsTable() {
    return this.readGovukTable(this.materialObligationsTable)
  }

  async submit(fullName) {
    await this.fullNameInput.fill(fullName)
    await this.confirmAndSubmitButton.click()
  }
}
