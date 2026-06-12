import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

export class CsocViewPage extends BasePage {
  constructor(page) {
    super(page)
    this.heading = page.getByRole('heading', {
      name: /csoc.*details|view.*csoc|certificate.*details|certificate of compliance/i
    })
    this.summaryList = page.locator('.govuk-summary-list')
    this.statusValue = this.rowValue('status')
  }

  async goto(declarationId) {
    const path = `/compliance/${declarationId}/certificate`
    await this.gotoPath(path)
    await expect(this.page).toHaveURL(new RegExp(`${path}(?:\\?|$)`))
    await this.expectLoaded()
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible()
  }

  async expectStatus(status) {
    await expect(this.statusValue).toBeVisible()
    await expect(this.statusValue).toHaveText(
      new RegExp(`^\\s*${status}\\s*$`, 'i')
    )
  }

  rowValue(rowName) {
    return this.summaryList
      .locator('.govuk-summary-list__row')
      .filter({
        has: this.page.locator('.govuk-summary-list__key', {
          hasText: new RegExp(rowName, 'i')
        })
      })
      .locator('.govuk-summary-list__value')
  }

  async expectDetailsMatch({ material, tonnage, period }) {
    await this.expectLoaded()

    if (material) {
      await expect(this.rowValue('material')).toContainText(material, {
        ignoreCase: true
      })
    }
    if (tonnage !== undefined) {
      await expect(this.rowValue('tonnage|weight')).toContainText(
        String(tonnage)
      )
    }
    if (period) {
      await expect(this.rowValue('period|year')).toContainText(period, {
        ignoreCase: true
      })
    }
  }
}
