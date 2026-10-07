import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

export class PrnPage extends BasePage {
  constructor(page) {
    super(page)
    this.heading = page.getByRole('heading', {
      name: /^packaging recycling note$/i
    })
  }

  // An awaiting-acceptance PRN or PERN offers Accept (a link styled as a
  // button) and a disabled Reject; nothing here is clicked.
  async expectLoadedForAwaitingPrn(prn) {
    const type = prn.type === 'PERN' ? 'PERN' : 'PRN'
    await expect(this.heading).toBeVisible()
    // Styled as a heading but rendered as a div, so it has no heading role.
    await expect(this.page.locator('.app-inset-text')).toContainText(
      `${type} number: ${prn.number}`
    )
    await expect(
      this.page.getByRole('button', {
        name: `Accept this ${type}`,
        exact: true
      })
    ).toBeVisible()
    const rejectButton = this.page.getByRole('button', {
      name: `Reject this ${type}`,
      exact: true
    })
    await expect(rejectButton).toBeVisible()
    await expect(rejectButton).toBeDisabled()
  }
}
