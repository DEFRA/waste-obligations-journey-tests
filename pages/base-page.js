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
}
