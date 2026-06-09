import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

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
}
