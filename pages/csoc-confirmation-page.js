import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

const DECLARATION_URL_PATTERN = /\/compliance\/([^/]+)\/certificate/

export class CsocConfirmationPage extends BasePage {
  constructor(page) {
    super(page)
    this.heading = page.getByRole('heading', {
      name: /\d{4} certificate of compliance/i
    })
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
