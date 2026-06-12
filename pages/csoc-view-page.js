import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'
import { EXPECTED_ORG } from '../data/csoc.data.js'

const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export class CsocViewPage extends BasePage {
  headingFor(year) {
    return this.page.getByRole('heading', {
      name: new RegExp(`${year} certificate of compliance`, 'i')
    })
  }

  async goto(declarationId, year) {
    const path = `/compliance/${declarationId}/certificate/view?year=${encodeURIComponent(year)}`
    await this.gotoPath(path)
    const escapedId = escapeRegExp(declarationId)
    const escapedYear = escapeRegExp(year)
    await expect(this.page).toHaveURL(
      new RegExp(
        `/compliance/${escapedId}/certificate/view\\?year=${escapedYear}(?:[&#]|$)`
      )
    )
    await this.expectLoaded(year)
  }

  async expectLoaded(year) {
    await expect(this.headingFor(year)).toBeVisible()
  }

  async expectOrgIdentity() {
    await expect(this.page.getByText(EXPECTED_ORG.name).first()).toBeVisible()
    await expect(this.page.getByText(EXPECTED_ORG.id).first()).toBeVisible()
  }
}
