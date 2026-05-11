import { browser, $, expect } from '@wdio/globals'

class BaseEprPage {
  open(path) {
    return browser.url(path)
  }

  heading(name) {
    return $(`aria/${name}`)
  }

  async expectHeading(name) {
    await expect(this.heading(name)).toBeDisplayed()
  }

  async clickByName(name) {
    await $(`aria/${name}`).click()
  }
}

export { BaseEprPage }
