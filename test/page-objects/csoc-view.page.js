import { $, $$, expect } from '@wdio/globals'
import { BaseEprPage } from './base-epr.page.js'

const HEADING_REGEX = /csoc.*details|view.*csoc|certificate.*details/i

class CsocViewPage extends BaseEprPage {
  get heading() {
    return $$('h1, h2').filter(async (h) =>
      HEADING_REGEX.test(await h.getText())
    )
  }

  get summaryList() {
    return $('.govuk-summary-list')
  }

  async expectLoaded() {
    const headings = await this.heading
    await expect(headings[0]).toBeDisplayed()
  }

  async rowValueText(rowNamePattern) {
    const rows = await this.summaryList.$$('.govuk-summary-list__row')
    const regex = new RegExp(rowNamePattern, 'i')
    for (const row of rows) {
      const key = await row.$('.govuk-summary-list__key')
      if (!(await key.isExisting())) continue
      const keyText = await key.getText()
      if (regex.test(keyText)) {
        const value = await row.$('.govuk-summary-list__value')
        return (await value.getText()).trim()
      }
    }
    return ''
  }

  async expectDetailsMatch({ material, tonnage, period }) {
    await this.expectLoaded()

    if (material) {
      const value = await this.rowValueText('material')
      expect(value.toLowerCase()).toContain(material.toLowerCase())
    }
    if (tonnage !== undefined) {
      const value = await this.rowValueText('tonnage|weight')
      expect(value).toContain(String(tonnage))
    }
    if (period) {
      const value = await this.rowValueText('period|year')
      expect(value.toLowerCase()).toContain(period.toLowerCase())
    }
  }
}

export default new CsocViewPage()
