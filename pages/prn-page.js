import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'
import { getPrnUrl } from '../utils/journey-entry-point.js'
import { ensureProxySessionForWebKit } from '../utils/proxy-session.js'
import { noteType } from '../utils/prn-selection.js'
import {
  DOWNLOAD_PDF_BUTTON_NAME,
  REJECTED_STATUS_LABEL,
  rejectedConfirmationHeading,
  rejectedStatusMeaning
} from '../utils/prn-confirmation.js'

export { DOWNLOAD_PDF_BUTTON_NAME }
export const CONFIRM_ACCEPT_BUTTON_NAME = 'Yes, accept'
export const CONFIRM_REJECT_BUTTON_NAME = 'Yes, reject'
export const DOWNLOAD_PDF_BUTTON_PREFIX = 'Download this'

export function acceptThisNoteName(prn) {
  return `Accept this ${noteType(prn)}`
}

export function rejectThisNoteName(prn) {
  return `Reject this ${noteType(prn)}`
}

// The action buttons and the download control. The download prefix covers the
// awaiting and accepted wordings, which share one locator.
export function labelsExcludedFromPdf(prn) {
  return [
    acceptThisNoteName(prn),
    rejectThisNoteName(prn),
    DOWNLOAD_PDF_BUTTON_PREFIX,
    CONFIRM_ACCEPT_BUTTON_NAME,
    CONFIRM_REJECT_BUTTON_NAME
  ]
}

export class PrnPage extends BasePage {
  constructor(page) {
    super(page)
    this.heading = page.getByRole('heading', {
      name: /^packaging recycling note$/i
    })
  }

  // Opens one PRN page. Without a proxy session the goto bounces through B2C
  // sign-in, which crashes Playwright's WebKit backend.
  async goto(account, prn) {
    const url = getPrnUrl(account, prn.id, prn.obligationYear)

    await ensureProxySessionForWebKit(this.page, url.href)
    await this.page.goto(url.href, { timeout: 60_000 })
    await expect(this.page).toHaveURL(
      (current) => current.pathname === url.pathname
    )
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

  // An awaiting-acceptance PRN or PERN offers Accept and Reject, both links
  // styled as buttons. Nothing here is clicked.
  async expectLoadedForAwaitingPrn(prn) {
    const type = noteType(prn)
    await expect(this.heading).toBeVisible()
    // Styled as a heading but rendered as a div, so it has no heading role.
    await expect(this.page.locator('.app-inset-text')).toContainText(
      `${type} number: ${prn.number}`
    )
    await expect(this.acceptButton(prn)).toBeVisible()
    const rejectButton = this.rejectButton(prn)
    await expect(rejectButton).toBeVisible()
    await expect(rejectButton).toBeEnabled()
  }

  // A smoke check of the accepted confirmation view: the success banner names
  // the note's type and the year it counts towards, both from real data. The
  // banner's other wording, the Status tag, the inset and which buttons show
  // are covered by waste-obligations-frontend's route tests.
  async expectLoadedForAcceptedPrn(prn) {
    const type = noteType(prn)
    await expect(this.heading).toBeVisible()
    await expect(
      this.page.locator(
        '.govuk-notification-banner--success .govuk-notification-banner__heading'
      )
    ).toHaveText(
      `You accepted this ${type} towards your ${prn.obligationYear} recycling obligations`
    )
  }

  // A rejected note shows the green confirmation banner. The download control
  // sits inside it. The PDF still says "Awaiting cancellation".
  async expectLoadedForRejectedPrn(prn) {
    const type = noteType(prn)
    await expect(this.heading).toBeVisible()
    await expect(this.rejectionBannerHeading()).toHaveText(
      rejectedConfirmationHeading(type)
    )
    await expect(this.page.getByText(rejectedStatusMeaning(type))).toBeVisible()
    // The PDF-only tag says "Awaiting cancellation". The screen tag is the one
    // inside .prn-hide-in-pdf.
    const status = this.page.locator('.prn-hide-in-pdf .govuk-tag')
    await expect(status).toHaveText(REJECTED_STATUS_LABEL)
    await expect(status).toHaveClass(/govuk-tag--red/)
  }

  rejectionBannerHeading() {
    return this.page.locator(
      '.govuk-notification-banner--success .govuk-notification-banner__heading'
    )
  }

  obligationsProgressButton(year) {
    return this.page.getByRole('button', {
      name: `View your ${year} recycling obligations progress`,
      exact: true
    })
  }

  // Banner, status tag, both follow-on buttons and the download in the banner.
  async expectRejectionConfirmation(prn) {
    await this.expectLoadedForRejectedPrn(prn)
    const year = prn.obligationYear
    await expect(
      this.page.getByRole('button', {
        name: `Accept or reject more PRNs and PERNs for ${year}`,
        exact: true
      })
    ).toBeVisible()
    await expect(this.obligationsProgressButton(year)).toBeVisible()
    await this.expectPdfControlInGreenBanner()
  }

  acceptButton(prn) {
    return this.page.getByRole('button', {
      name: acceptThisNoteName(prn),
      exact: true
    })
  }

  rejectButton(prn) {
    return this.page.getByRole('button', {
      name: rejectThisNoteName(prn),
      exact: true
    })
  }

  // Accepts the open note and waits until the confirmation view replaces the
  // confirm-accept page.
  async accept(prn) {
    await this.acceptButton(prn).click()
    await this.page
      .getByRole('button', { name: CONFIRM_ACCEPT_BUTTON_NAME, exact: true })
      .click()
    await expect(this.page).toHaveURL(
      (url) => !url.pathname.includes('confirm-accept')
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

  // The "Download this ... as a PDF" control. It is a button, not a link.
  pdfButton() {
    return this.page.getByRole('button', {
      name: DOWNLOAD_PDF_BUTTON_NAME
    })
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
}
