import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

export class CsocSubmissionPage extends BasePage {
  constructor(page) {
    super(page)
    this.heading = page.getByRole('heading', {
      name: /Check and submit your \d{4} (certificate|statement) of compliance/i
    })
    this.fullNameInput = page.getByLabel(/full name/i)
    this.confirmAndSubmitButton = page.getByRole('button', {
      name: /confirm and submit/i
    })
    // Stable id rendered by both producer and CSO check-and-submit pages,
    // regardless of whether obligations are met or not. The banner text
    // changes ("have been met" vs "have not been met") so we anchor on the
    // id and only assert that the status section is rendered.
    this.obligationsStatusBanner = page.locator('#overall-obligation-status')
    // CSO journey adds a required Regulation 43 radio fieldset before submit.
    this.regulation43Fieldset = page.locator('fieldset', {
      hasText: /regulation 43/i
    })
    this.regulation43YesRadio = this.regulation43Fieldset.getByRole('radio', {
      name: /^yes$/i
    })
    this.complianceSchemeLabel = page.locator(
      'xpath=//dt[normalize-space()="Compliance scheme"]'
    )
    // Match by a stable thead column rather than a td[data-header] attribute:
    // the submission page's tds don't carry data-header on desktop, which would
    // make a data-header filter return an empty locator. Both the main
    // materials table and the glass breakdown table have a "Material" thead;
    // .first() picks the main one (it precedes the breakdown in DOM order).
    this.materialObligationsTable = page
      .locator('table.govuk-table')
      .filter({
        has: page.locator('thead th', { hasText: /^Material$/ })
      })
      .first()
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible()
  }

  // CSO renders a "Compliance scheme" summary row; producer renders
  // "Organisation name". We branch on that DOM marker so the same page object
  // serves both spec variants without env-var sniffing.
  async isCsoVariant() {
    return (await this.complianceSchemeLabel.count()) > 0
  }

  async expectOrganisationDetails() {
    if (await this.isCsoVariant()) {
      await this.expectFieldPopulated('Compliance scheme')
      await this.expectFieldPopulated('Compliance scheme operator')
      await this.expectFieldPopulated('Organisation ID', 0)
      // CSO test orgs may render with an empty Address row; assert the row
      // exists but allow no value.
      await this.expectFieldRendered('Address')
      await this.expectFieldPopulated('Name on account')
      await this.expectFieldPopulated('Regulator')
    } else {
      await this.expectFieldPopulated('Organisation name')
      await this.expectFieldPopulated('Address')
      await this.expectFieldPopulated('Regulator')
    }
    await this.expectMailtoLinkPopulated()
  }

  // Derive the expected banner state from the materials table rather than
  // hardcoding either text: the page should show "have not been met" when at
  // least one material row is Not met, and "have been met" otherwise. Catches
  // banner/table inconsistencies that a state-agnostic check would miss.
  async expectObligationsMet() {
    await expect(this.obligationsStatusBanner).toBeVisible()
    const rows = await this.readObligationsTable()
    const materialRows = rows.filter((r) => r.Material !== 'Totals')
    const anyNotMet = materialRows.some((r) =>
      /not\s*met/i.test(r.Status ?? '')
    )
    const expected = anyNotMet ? 'have not been met' : 'have been met'
    await expect(this.obligationsStatusBanner).toContainText(expected)
  }

  async readObligationsTable() {
    return this.readGovukTable(this.materialObligationsTable)
  }

  async submit(fullName) {
    if ((await this.regulation43Fieldset.count()) > 0) {
      await this.regulation43YesRadio.check()
    }
    await this.fullNameInput.fill(fullName)
    await this.confirmAndSubmitButton.click()
  }
}
