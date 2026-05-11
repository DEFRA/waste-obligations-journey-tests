import { $, $$, expect } from '@wdio/globals'
import { BaseEprPage } from './base-epr.page.js'

const HEADING_REGEX =
  /submitted|submission complete|csoc.*submitted|application complete/i
const REFERENCE_REGEX = /[A-Z0-9-]{4,}/

class CsocConfirmationPage extends BaseEprPage {
  get confirmationPanel() {
    return $('.govuk-panel--confirmation')
  }

  get confirmationHeading() {
    return $$('h1, h2').filter(async (h) =>
      HEADING_REGEX.test(await h.getText())
    )
  }

  async expectSubmitted() {
    const headings = await this.confirmationHeading
    await expect(headings[0]).toBeDisplayed()
  }

  async getReferenceNumber() {
    const panel = this.confirmationPanel
    if (await panel.isExisting()) {
      const body = await panel.$('.govuk-panel__body')
      if (await body.isExisting()) {
        const text = (await body.getText()).trim()
        const match = text.match(REFERENCE_REGEX)
        return match ? match[0] : text
      }
      return (await panel.getText()).trim()
    }
    return ''
  }
}

export default new CsocConfirmationPage()
