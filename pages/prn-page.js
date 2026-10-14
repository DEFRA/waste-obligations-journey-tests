import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

export class PrnPage extends BasePage {
  constructor(page) {
    super(page)
    this.heading = page.getByRole('heading', {
      name: /^packaging recycling note$/i
    })
  }

  // For pages reached from a PRN number link when only the number is known
  // (e.g. from the check-selection page on a deployed run).
  async expectLoadedForNumber(number) {
    await expect(this.heading).toBeVisible()
    // A RegExp is matched against the raw text, which wraps the number onto
    // its own line, so allow any whitespace after the label.
    const escaped = number.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
    await expect(this.page.locator('.app-inset-text')).toContainText(
      new RegExp(String.raw`(PRN|PERN) number:\s*${escaped}`)
    )
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

  // A smoke check of the accepted confirmation view: the success banner names
  // the note's type and the year it counts towards, both from real data. The
  // banner's other wording, the Status tag, the inset and which buttons show
  // are covered by waste-obligations-frontend's route tests.
  async expectLoadedForAcceptedPrn(prn) {
    const type = prn.type === 'PERN' ? 'PERN' : 'PRN'
    await expect(this.heading).toBeVisible()
    await expect(
      this.page.locator(
        '.govuk-notification-banner--success .govuk-notification-banner__heading'
      )
    ).toHaveText(
      `You accepted this ${type} towards your ${prn.obligationYear} recycling obligations`
    )
  }

  // The follow-on to the PRNs list for the year the note counts towards.
  async acceptOrRejectMore(year) {
    const button = this.page.getByRole('button', {
      name: `Accept or reject more PRNs and PERNs for ${year}`,
      exact: true
    })
    await expect(button).toBeVisible()
    await Promise.all([
      this.page.waitForURL(/\/prns(\?|$)/, { waitUntil: 'domcontentloaded' }),
      button.click()
    ])
  }
}
