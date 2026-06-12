import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

const DECLARATION_URL_PATTERN = /\/compliance\/([^/]+)\/certificate/

export class CsocConfirmationPage extends BasePage {
  headingFor(year) {
    return this.page.getByRole('heading', {
      name: new RegExp(`${year} certificate of compliance`, 'i')
    })
  }

  async expectSubmitted(year) {
    await expect(this.headingFor(year)).toBeVisible()
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
