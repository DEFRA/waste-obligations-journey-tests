import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

export class CsocSubmissionPage extends BasePage {
  constructor(page) {
    super(page)
    this.heading = page.getByTestId('app-heading-title')
    this.materialSelect = page.getByLabel(/material/i)
    this.tonnageInput = page.getByLabel(/tonnage|weight/i)
    this.reportingPeriodSelect = page.getByLabel(/period|reporting year|year/i)
    this.declarationCheckbox = page.getByRole('checkbox', {
      name: /confirm|declaration|i agree/i
    })
    this.submitButton = page.getByRole('button', {
      name: /^submit$|confirm and submit|submit certificate/i
    })
    this.continueButton = page.getByRole('button', { name: /^continue$/i })
    this.errorSummary = page.getByRole('alert')
  }

  async expectFormVisible() {
    await expect(this.heading).toBeVisible()
  }

  async fillForm({ material, tonnage, period }) {
    await this.selectIfPresent(this.materialSelect, material)
    await this.fillIfPresent(this.tonnageInput, String(tonnage))
    await this.selectIfPresent(this.reportingPeriodSelect, period)

    if (await this.declarationCheckbox.count()) {
      await this.declarationCheckbox.check()
    }
  }

  async submit() {
    const submit = (await this.submitButton.count())
      ? this.submitButton
      : this.continueButton
    await Promise.all([
      this.page.waitForLoadState('networkidle'),
      submit.first().click()
    ])
    await expect(this.errorSummary).toHaveCount(0)
  }

  async selectIfPresent(locator, value) {
    if (!value || !(await locator.count())) return
    const tag = await locator.first().evaluate((el) => el.tagName.toLowerCase())
    if (tag === 'select') {
      await locator
        .first()
        .selectOption({ label: value })
        .catch(async () => {
          await locator.first().selectOption(value)
        })
    } else {
      await locator.first().fill(value)
    }
  }

  async fillIfPresent(locator, value) {
    if (!value || !(await locator.count())) return
    await locator.first().fill(value)
  }
}
