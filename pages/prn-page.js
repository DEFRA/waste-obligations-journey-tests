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

  // A rejected note shows the green banner. The download control sits inside it.
  async expectLoadedForRejectedPrn(prn) {
    const type = prn.type === 'PERN' ? 'PERN' : 'PRN'
    await expect(this.heading).toBeVisible()
    await expect(
      this.page.locator(
        '.govuk-notification-banner--success .govuk-notification-banner__heading'
      )
    ).toHaveText(`${type} rejected.`)
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

  // The "Download this ... as a PDF" control. It is a button, not a link.
  pdfButton() {
    return this.page.getByRole('button', {
      name: /^download this .*as a pdf$/i
    })
  }

  // The cookie banner covers the top of the page on a small screen, so a user
  // would dismiss it before using a control in the green banner.
  async dismissCookieBannerIfShown() {
    const reject = this.page.getByRole('button', {
      name: 'Reject analytics cookies'
    })

    if (await reject.isVisible()) {
      await reject.click()
    }
  }

  // Awaiting acceptance and Accepted views: the control is the last thing on
  // the page, below the note's details and the other buttons.
  async expectPdfControlAtBase() {
    const button = this.pdfButton()
    await expect(button).toBeVisible()
    await expect(
      this.page.locator('.govuk-notification-banner').filter({ has: button })
    ).toHaveCount(0)

    const contentBelow = await button.evaluate((control) => {
      const main = document.querySelector('main')
      const bottom = control.getBoundingClientRect().bottom
      const isControlsAncestor = (node) =>
        node.contains(control) || control.contains(node)

      return [
        ...main.querySelectorAll(
          'p, h1, h2, h3, li, td, dd, dt, label, a, button'
        )
      ]
        .filter(
          (node) =>
            !isControlsAncestor(node) &&
            node.innerText.trim() &&
            node.getBoundingClientRect().top >= bottom - 1
        )
        .map((node) => node.innerText.trim().slice(0, 40))
    })

    expect(
      contentBelow,
      'Nothing in the page should come after the PDF control'
    ).toEqual([])
  }

  // Confirmation and Rejection views: the control is inside the green banner.
  async expectPdfControlInGreenBanner() {
    const banner = this.page
      .locator('.govuk-notification-banner--success')
      .filter({ has: this.pdfButton() })

    await expect(banner).toHaveCount(1)
    await expect(banner).toBeVisible()
  }

  // Clicks the control and returns what the browser downloaded.
  async downloadPdf() {
    const [download] = await Promise.all([
      this.page.waitForEvent('download', { timeout: 60_000 }),
      this.pdfButton().click()
    ])

    return {
      filename: download.suggestedFilename(),
      file: await download.path()
    }
  }
}
