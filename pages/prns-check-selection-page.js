import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

// "Check your selection before accepting": reached from "Accept selected
// PRNs and PERNs" on the list. One table per material, a Total row per
// table, a "Remove from selection" button per PRN, a disabled Accept and a
// "Go back" button. Nothing here accepts a PRN.
export class PrnsCheckSelectionPage extends BasePage {
  constructor(page) {
    super(page)
    this.heading = page.getByRole('heading', {
      name: /^check your selection before accepting$/i
    })
    this.tables = page.locator('table.app-check-selection-table')
    this.acceptButton = page.getByRole('button', {
      name: 'Accept',
      exact: true
    })
    this.goBackButton = page.getByRole('button', {
      name: 'Go back',
      exact: true
    })
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible()
  }

  table(heading) {
    return this.page.getByRole('table', { name: heading, exact: true })
  }

  // Reads every material table: its caption, the PRN rows' operational
  // values and the Total row. Issuer names are read for comparison only and
  // must not be logged.
  async readMaterialTables() {
    return this.tables.evaluateAll((tables) =>
      tables.map((table) => {
        const rows = [...table.querySelectorAll('tbody tr')]
        const totalRow = rows.at(-1)
        const text = (cell) => cell?.textContent?.replace(/\s+/g, ' ').trim()

        return {
          heading: text(table.querySelector('caption')) || '',
          rows: rows.slice(0, -1).map((row) => {
            const cells = row.querySelectorAll('td')
            return {
              number: text(cells[0]?.querySelector('a')) || '',
              issuedAt: text(cells[1]) || '',
              issuer: text(cells[2]) || '',
              tonnage: text(cells[3]) || ''
            }
          }),
          totalLabel: text(totalRow?.querySelectorAll('td')[0]) || '',
          total: text(totalRow?.querySelectorAll('td')[1]) || ''
        }
      })
    )
  }

  async openPrn(number) {
    await this.page.getByRole('link', { name: number, exact: true }).click()
  }

  // The visible "Remove from selection" text is followed by the PRN number in
  // visually hidden text, so each button's accessible name is unique.
  removeButton(number) {
    return this.page.getByRole('button', {
      name: `Remove from selection ${number}`,
      exact: true
    })
  }

  async removePrn(number) {
    await this.removeButton(number).click()
    await expect(this.removeButton(number)).toHaveCount(0)
  }

  async clickGoBack() {
    await this.goBackButton.click()
  }
}
