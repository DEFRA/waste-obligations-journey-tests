import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

export class PrnsListPage extends BasePage {
  constructor(page) {
    super(page)
    this.heading = page.getByRole('heading', {
      name: /^accept or reject prns and perns/i
    })
    this.sortSelect = page.locator('#sort')
    this.materialSelect = page.locator('#filter')
    this.clearAllLink = page.locator('#clearSortFilter')
  }

  // Reads the material column for every currently rendered row. Used to
  // assert a material filter actually narrows the list, without depending
  // on which specific PRNs are seeded in a given environment.
  async readRowMaterials() {
    return this.page
      .locator('table.app-prns-table tbody tr')
      .evaluateAll((rows) =>
        rows.map(
          (row) => row.querySelectorAll('td')[1]?.textContent?.trim() || ''
        )
      )
  }

  async selectSort(label) {
    await Promise.all([
      this.page.waitForLoadState('networkidle'),
      this.sortSelect.selectOption({ label })
    ])
  }

  async selectMaterial(label) {
    await Promise.all([
      this.page.waitForLoadState('networkidle'),
      this.materialSelect.selectOption({ label })
    ])
  }

  async clickClearAll() {
    await Promise.all([
      this.page.waitForLoadState('networkidle'),
      this.clearAllLink.click()
    ])
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

  async expectLoaded() {
    await expect(this.heading).toBeVisible()
  }
}
