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

  // Env-agnostic populated-field check for GDS summary lists: locate the
  // `<dd>` paired with a `<dt>` of the given label and assert its trimmed
  // text exceeds `minLength`. Used in place of equality checks against
  // env-seeded org names / addresses / regulators / emails.
  async expectFieldPopulated(label, minLength = 10) {
    const value = this.page.locator(
      `xpath=//dt[normalize-space()=${JSON.stringify(label)}]/following-sibling::dd[1]`
    )
    await expect(value).toBeVisible()
    const text = (await value.innerText()).trim()
    expect(
      text.length,
      `expected "${label}" value to be > ${minLength} chars (got "${text}")`
    ).toBeGreaterThan(minLength)
  }

  async expectMailtoLinkPopulated(minLength = 10) {
    const link = this.page.locator('a[href^="mailto:"]').first()
    await expect(link).toBeVisible()
    const text = (await link.innerText()).trim()
    expect(
      text.length,
      `expected mailto link text to be > ${minLength} chars (got "${text}")`
    ).toBeGreaterThan(minLength)
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
