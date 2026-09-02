import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'
import { getJourneyViewPath } from '../utils/journey-entry-point.js'

export class CsocViewPage extends BasePage {
  constructor(page) {
    super(page)
    this.complianceSchemeLabel = page.locator(
      'xpath=//dt[normalize-space()="Compliance scheme"]'
    )
  }

  headingFor(year) {
    return this.page.getByRole('heading', {
      name: new RegExp(`${year} (certificate|statement) of compliance`, 'i')
    })
  }

  async expectLoaded(year) {
    await expect(this.page).toHaveURL(
      /\/(certificate|statement)\/[a-f0-9]{24}(?:\?|$)/
    )
    await expect(this.headingFor(year)).toBeVisible()
  }

  async goto(account, declarationId) {
    await this.gotoPath(getJourneyViewPath(account, declarationId))
  }

  // CSO renders a "Compliance scheme" row; producer renders "Organisation
  // name". Auto-detect so the same page object serves both variants.
  async isCsoVariant() {
    return (await this.complianceSchemeLabel.count()) > 0
  }

  async expectOrgIdentity() {
    if (await this.isCsoVariant()) {
      await this.expectFieldPopulated('Compliance scheme')
    } else {
      await this.expectFieldPopulated('Organisation name')
    }
    // Org IDs are short numeric strings in some envs and longer GUIDs in
    // others, so the > 10-char rule doesn't apply — just assert non-empty.
    await this.expectFieldPopulated('Organisation ID', 0)
  }
}
