import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'
import { isLocatorVisible } from '../utils/environment-features.js'

export class PrnsListPage extends BasePage {
  constructor(page) {
    super(page)
    this.heading = page.getByRole('heading', {
      name: /^accept or reject prns and perns$/i
    })
  }

  // Read only the list's operational values, excluding names and free-text notes.
  async readPrnSummaries() {
    return this.page
      .locator('table.app-prns-table tbody tr')
      .evaluateAll((rows) =>
        rows.map((row) => {
          const cells = row.querySelectorAll('td')
          return {
            number:
              cells[0]?.querySelector('a')?.textContent?.trim() || '(missing)',
            material: cells[1]?.textContent?.trim() || '(missing)',
            tonnage: cells[5]?.textContent?.trim() || '(missing)'
          }
        })
      )
  }

  async expectPrnVisible(prn) {
    const numberLink = this.page.getByRole('link', {
      name: prn.number,
      exact: true
    })
    const row = this.page.getByRole('row').filter({ has: numberLink })
    await expect(numberLink).toBeVisible()
    await expect(row).toHaveCount(1)
    for (const value of [
      prn.material,
      prn.issuer.organisationName,
      String(prn.tonnage)
    ]) {
      await expect(
        row.getByRole('cell', { name: value, exact: true })
      ).toBeVisible()
    }
  }

  async isAvailable() {
    return isLocatorVisible(this.heading)
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible()
  }
}
