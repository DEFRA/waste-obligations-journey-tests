import { expect } from '@playwright/test'

export class BasePage {
  constructor(page) {
    this.page = page
  }

  async gotoPath(path) {
    await this.page.goto(path)
  }

  async expectHeading(name) {
    await expect(this.page.getByRole('heading', { name })).toBeVisible()
  }

  async clickByRole(role, name) {
    await this.page.getByRole(role, { name }).click()
  }

  async readGovukTable(tableLocator) {
    const readVisibleText = (locator) =>
      locator.evaluateAll((nodes) =>
        nodes.map((node) => {
          const clone = node.cloneNode(true)
          clone
            .querySelectorAll('.govuk-visually-hidden')
            .forEach((el) => el.remove())
          return (clone.textContent || '').replace(/\s+/g, ' ').trim()
        })
      )

    const headers = await readVisibleText(tableLocator.locator('thead th'))
    const rowLocators = tableLocator.locator('tbody tr')
    const rowCount = await rowLocators.count()
    const rows = []
    for (let i = 0; i < rowCount; i++) {
      const cells = await readVisibleText(rowLocators.nth(i).locator('th, td'))
      const row = {}
      headers.forEach((header, idx) => {
        row[header] = cells[idx] ?? ''
      })
      rows.push(row)
    }
    return rows
  }
}
