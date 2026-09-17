import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

export class PrnsListPage extends BasePage {
  constructor(page) {
    super(page)
    this.heading = page.getByRole('heading', {
      name: /^accept or reject prns and perns$/i
    })
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible()
  }
}
