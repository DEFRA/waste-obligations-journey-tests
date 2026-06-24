import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'
import { EXPECTED_ORG } from '../data/csoc.data.js'

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
    await expect(this.page.getByText(EXPECTED_ORG.name).first()).toBeVisible()
    await expect(this.page.getByText(EXPECTED_ORG.id).first()).toBeVisible()
  }
}
