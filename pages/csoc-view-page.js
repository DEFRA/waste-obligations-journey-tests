import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

export class CsocViewPage extends BasePage {
  headingFor(year) {
    return this.page.getByRole('heading', {
      name: new RegExp(`${year} certificate of compliance`, 'i')
    })
  }

  async expectLoaded(year) {
    await expect(this.page).toHaveURL(/\/certificate\/[a-f0-9]{24}(?:\?|$)/)
    await expect(this.headingFor(year)).toBeVisible()
  }

  async expectOrgIdentity() {
    await this.expectFieldPopulated('Organisation name')
    // Org IDs are short numeric strings in some envs and longer GUIDs in
    // others, so the > 10-char rule doesn't apply — just assert non-empty.
    await this.expectFieldPopulated('Organisation ID', 0)
  }
}
