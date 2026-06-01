import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'
import {
  EXPECTED_ORG,
  REGULATOR_EMAIL,
  OBLIGATIONS_MET_STATUS
} from '../data/csoc.data.js'

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
    this.regulatorEmail = page.getByText(REGULATOR_EMAIL)
    this.obligationsMetStatus = page.getByText(OBLIGATIONS_MET_STATUS)
    this.materialObligationsTable = page
      .locator('table.govuk-table')
      .filter({
        has: page.getByRole('columnheader', {
          name: /Recycling obligations to meet/i
        })
      })
      .first()
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible()
  }

  async expectOrganisationDetails() {
    await expect(this.page.getByText(EXPECTED_ORG.name).first()).toBeVisible()
    await expect(this.page.getByText(EXPECTED_ORG.address)).toBeVisible()
    await expect(
      this.page.getByText(EXPECTED_ORG.regulator).first()
    ).toBeVisible()
    await expect(this.regulatorEmail.first()).toBeVisible()
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
