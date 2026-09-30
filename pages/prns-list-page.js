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

  // Reads the sortable values of every rendered row, excluding names and
  // free-text notes. Dates are parsed from the rendered "dd MMM yyyy" text.
  async readPrnRows() {
    const rows = await this.page
      .locator('table.app-prns-table tbody tr')
      .evaluateAll((rows) =>
        rows.map((row) => {
          const cells = row.querySelectorAll('td')
          return {
            number: cells[0]?.querySelector('a')?.textContent?.trim() || '',
            material: cells[1]?.textContent?.trim() || '',
            issuedAt: cells[2]?.textContent?.trim() || '',
            tonnage: cells[5]?.textContent?.trim() || ''
          }
        })
      )
    return rows.map((row) => ({
      ...row,
      issuedAtTime: Date.parse(`${row.issuedAt} UTC`),
      tonnageValue: Number(row.tonnage.replaceAll(',', ''))
    }))
  }

  // Returns { from, to, total } from "Showing 1 to 3 of 3", or null when the
  // summary is absent because no PRNs are listed.
  async readResultsSummary() {
    const pattern = /Showing (\d[\d,]*) to (\d[\d,]*) of (\d[\d,]*)/
    const summary = this.page.getByText(pattern)
    if ((await summary.count()) === 0) {
      return null
    }
    const [from, to, total] = (await summary.first().textContent())
      .match(pattern)
      .slice(1)
      .map((value) => Number(value.replaceAll(',', '')))
    return { from, to, total }
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
