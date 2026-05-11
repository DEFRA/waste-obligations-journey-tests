import { $$, expect } from '@wdio/globals'
import { BaseEprPage } from './base-epr.page.js'

class LandingPage extends BaseEprPage {
  path = '/report-data'

  get manageObligationsLink() {
    return $$('a').filter(async (link) => {
      const text = await link.getText()
      return /manage your \d{4} recycling/i.test(text)
    })
  }

  async open() {
    await super.open(this.path)
    await this.expectLoaded()
  }

  async expectLoaded() {
    const links = await this.manageObligationsLink
    await expect(links[0]).toBeDisplayed()
  }

  async goToObligations() {
    const links = await this.manageObligationsLink
    await links[0].click()
  }
}

export default new LandingPage()
