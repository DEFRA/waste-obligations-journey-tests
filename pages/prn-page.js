import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'
import {
  getObligationsUrl,
  getPrnsListUrl
} from '../utils/journey-entry-point.js'

// The accepted banner's tonnage: "1 tonne", otherwise "N tonnes".
export function formatTonnes(tonnage) {
  return tonnage === 1 ? '1 tonne' : `${tonnage} tonnes`
}

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

  // The accepted confirmation view: success banner, the year the PRN counts
  // towards, a green Accepted tag and the follow-on buttons. The obligations
  // button depends on the frontend's FEATURE_MANAGE_OBLIGATIONS, so the caller
  // passes true/false to assert it, or undefined to leave it unchecked.
  async expectLoadedForAcceptedPrn(prn, { account, obligationsButton } = {}) {
    const type = prn.type === 'PERN' ? 'PERN' : 'PRN'
    const year = prn.obligationYear
    const tonnes = formatTonnes(prn.tonnage)
    await expect(this.heading).toBeVisible()

    // Exact match on each sentence. The banner also holds the "Success" title
    // and the download button (itself wrapped in a p.govuk-body), so take the
    // heading and the paragraph directly after it.
    const banner = this.page.locator('.govuk-notification-banner--success')
    const bannerHeading = banner.locator('.govuk-notification-banner__heading')
    await expect(bannerHeading).toHaveText(
      `You accepted this ${type} towards your ${year} recycling obligations`
    )
    await expect(
      banner.locator('.govuk-notification-banner__heading + p')
    ).toHaveText(
      `You have accepted ${tonnes} towards your ${year} recycling obligation for ${prn.material} material.`
    )

    const inset = this.page.locator('.app-inset-text')
    await expect(inset).toContainText(`${type} number: ${prn.number}`)
    await expect(inset).toContainText(
      `Accepted towards ${year} recycling obligations`
    )

    await expect(
      this.page.locator('.govuk-tag--green', { hasText: /^\s*Accepted\s*$/ })
    ).toBeVisible()
    await expect(
      this.page.getByRole('button', { name: `Accept this ${type}` })
    ).toHaveCount(0)

    const acceptMore = this.page.getByRole('button', {
      name: `Accept or reject more PRNs and PERNs for ${year}`,
      exact: true
    })
    await expect(acceptMore).toBeVisible()
    const acceptMoreHref = await acceptMore.getAttribute('href')
    expect(new URL(acceptMoreHref, this.page.url()).href).toBe(
      getPrnsListUrl(account, year).href
    )

    if (obligationsButton === undefined) return
    const obligations = this.page.getByRole('button', {
      name: `View your ${year} recycling obligations progress`,
      exact: true
    })
    if (obligationsButton) {
      await expect(obligations).toBeVisible()
      const obligationsHref = await obligations.getAttribute('href')
      expect(new URL(obligationsHref, this.page.url()).href).toBe(
        getObligationsUrl(account, year).href
      )
    } else {
      await expect(obligations).toHaveCount(0)
    }
  }
}
