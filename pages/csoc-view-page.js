import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

export class CsocViewPage extends BasePage {
  constructor(page) {
    super(page)
    this.heading = page.getByRole('heading', {
      name: /\d{4} certificate of compliance/i
    })
  }

  async goto(declarationId, year) {
    const path = `/compliance/${declarationId}/certificate/view?year=${year}`
    await this.gotoPath(path)
    await expect(this.page).toHaveURL(
      new RegExp(`/compliance/${declarationId}/certificate/view`)
    )
    await this.expectLoaded()
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible()
  }
}
