import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

export class CsocConfirmationPage extends BasePage {
  constructor(page) {
    super(page)
    this.confirmationPanel = page
      .locator('.govuk-panel--confirmation')
      .or(page.getByRole('region', { name: /confirmation|submitted/i }))
    this.confirmationHeading = page.getByRole('heading', {
      name: /submitted|submission complete|csoc.*submitted|application complete/i
    })
    this.referenceNumber = this.confirmationPanel
      .locator('.govuk-panel__body')
      .getByText(/[A-Z0-9-]{4,}/)
  }

  async expectSubmitted() {
    await expect(this.confirmationHeading).toBeVisible()
  }

  async getReferenceNumber() {
    if (await this.referenceNumber.count()) {
      return (await this.referenceNumber.first().textContent())?.trim() ?? ''
    }
    const panelText = (await this.confirmationPanel.first().textContent()) ?? ''
    return panelText.trim()
  }
}
