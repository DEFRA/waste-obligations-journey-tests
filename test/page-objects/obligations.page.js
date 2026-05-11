import { $, $$, expect } from '@wdio/globals'
import { BaseEprPage } from './base-epr.page.js'

const HEADING_REGEX = /manage your \d{4} recycling/i
const VIEW_LINK_REGEX =
  /view.*statement|submitted.*statement|view.*csoc|view submitted/i

class ObligationsPage extends BaseEprPage {
  path = '/report-data/manage-your-recycling-obligations'

  get heading() {
    return $$('h1, h2').filter(async (h) =>
      HEADING_REGEX.test(await h.getText())
    )
  }

  get submitStatementButton() {
    return $('aria/Submit statement')
  }

  get viewSubmittedStatementLinks() {
    return $$('a').filter(async (a) => VIEW_LINK_REGEX.test(await a.getText()))
  }

  async open() {
    await super.open(this.path)
    await this.expectLoaded()
  }

  async expectLoaded() {
    const headings = await this.heading
    await expect(headings[0]).toBeDisplayed()
  }

  async startCsocSubmission() {
    await this.submitStatementButton.click()
  }

  async openSubmittedCsoc() {
    const links = await this.viewSubmittedStatementLinks
    await links[0].click()
  }
}

export default new ObligationsPage()
