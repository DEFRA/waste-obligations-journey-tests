import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

const DECLARATION_URL_PATTERN = /\/compliance\/([^/]+)\/certificate/

export class CsocConfirmationPage extends BasePage {
  constructor(page) {
    super(page)
    this.heading = page.getByRole('heading', {
      name: /You have submitted your \d{4} certificate of compliance/i
    })
    this.metStatusText = page.getByText(
      /submitted your certificate of compliance with a .{1,3}MET.{1,3} status/i
    )
  }

  async expectSubmitted() {
    await expect(this.heading).toBeVisible()
  }

  async getDeclarationId() {
    await this.page.waitForURL(DECLARATION_URL_PATTERN)
    const match = this.page.url().match(DECLARATION_URL_PATTERN)
    if (!match) {
      throw new Error(
        `Could not parse declaration id from confirmation URL: ${this.page.url()}`
      )
    }
    return match[1]
  }
}
