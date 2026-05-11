import { browser, $, $$, expect } from '@wdio/globals'
import { BaseEprPage } from './base-epr.page.js'

const MATERIAL_LABEL = /material/i
const TONNAGE_LABEL = /tonnage|weight/i
const PERIOD_LABEL = /period|reporting year|year/i
const DECLARATION_LABEL = /confirm|declaration|i agree/i
const SUBMIT_BUTTON = /^submit$|confirm and submit|submit certificate/i
const CONTINUE_BUTTON = /^continue$/i

class CsocSubmissionPage extends BaseEprPage {
  get heading() {
    return $('[data-testid="app-heading-title"]')
  }

  get errorSummary() {
    return $$('[role="alert"]')
  }

  async fieldByLabel(labelRegex) {
    const labels = await $$('label')
    for (const label of labels) {
      const text = await label.getText()
      if (!labelRegex.test(text)) continue
      const forAttr = await label.getAttribute('for')
      if (forAttr) {
        const field = await $(`#${forAttr}`)
        if (await field.isExisting()) return field
      }
      const nested = await label.$('input, select, textarea')
      if (await nested.isExisting()) return nested
    }
    return null
  }

  async checkboxByLabel(labelRegex) {
    const labels = await $$('label')
    for (const label of labels) {
      const text = await label.getText()
      if (!labelRegex.test(text)) continue
      const forAttr = await label.getAttribute('for')
      if (forAttr) {
        const field = await $(`#${forAttr}`)
        if (
          (await field.isExisting()) &&
          (await field.getAttribute('type')) === 'checkbox'
        ) {
          return field
        }
      }
    }
    return null
  }

  async buttonMatching(regex) {
    const buttons = await $$('button, input[type="submit"]')
    for (const btn of buttons) {
      const text =
        (await btn.getText()) || (await btn.getAttribute('value')) || ''
      if (regex.test(text)) return btn
    }
    return null
  }

  async expectFormVisible() {
    await expect(this.heading).toBeDisplayed()
  }

  async fillForm({ material, tonnage, period }) {
    await this.selectIfPresent(MATERIAL_LABEL, material)
    await this.fillIfPresent(TONNAGE_LABEL, String(tonnage))
    await this.selectIfPresent(PERIOD_LABEL, period)

    const declaration = await this.checkboxByLabel(DECLARATION_LABEL)
    if (declaration && !(await declaration.isSelected())) {
      await declaration.click()
    }
  }

  async submit() {
    const submit =
      (await this.buttonMatching(SUBMIT_BUTTON)) ||
      (await this.buttonMatching(CONTINUE_BUTTON))
    await submit.click()
    await browser.waitUntil(
      async () =>
        (await browser.execute(() => document.readyState)) === 'complete',
      { timeout: 30000, timeoutMsg: 'page did not finish loading after submit' }
    )
    await expect(await this.errorSummary).toHaveLength(0)
  }

  async selectIfPresent(labelRegex, value) {
    if (!value) return
    const field = await this.fieldByLabel(labelRegex)
    if (!field) return
    const tag = (await field.getTagName()).toLowerCase()
    if (tag === 'select') {
      try {
        await field.selectByVisibleText(value)
      } catch {
        await field.selectByAttribute('value', value)
      }
    } else {
      await field.setValue(value)
    }
  }

  async fillIfPresent(labelRegex, value) {
    if (!value) return
    const field = await this.fieldByLabel(labelRegex)
    if (!field) return
    await field.setValue(value)
  }
}

export default new CsocSubmissionPage()
