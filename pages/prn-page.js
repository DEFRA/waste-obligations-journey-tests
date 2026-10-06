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

  // The accepted confirmation view: success banner, the year the PRN counts
  // towards, a green Accepted tag and the follow-on buttons. The obligations
  // button depends on the frontend's FEATURE_MANAGE_OBLIGATIONS, so the caller
  // passes true/false to assert it, or undefined to leave it unchecked.
  async expectLoadedForAcceptedPrn(prn, { obligationsButton } = {}) {
    const type = prn.type === 'PERN' ? 'PERN' : 'PRN'
    const year = prn.obligationYear
    const tonnes = prn.tonnage === 1 ? '1 tonne' : `${prn.tonnage} tonnes`
    await expect(this.heading).toBeVisible()

    const banner = this.page.locator('.govuk-notification-banner--success')
    await expect(banner).toContainText(
      `You accepted this ${type} towards your ${year} recycling obligations`
    )
    await expect(banner).toContainText(
      `You have accepted ${tonnes} towards your ${year} recycling obligation`
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
    await expect(acceptMore).toHaveAttribute(
      'href',
      new RegExp(`/prns\\?year=${year}$`)
    )

    if (obligationsButton === undefined) return
    const obligations = this.page.getByRole('button', {
      name: `View your ${year} recycling obligations progress`,
      exact: true
    })
    if (obligationsButton) {
      await expect(obligations).toBeVisible()
      await expect(obligations).toHaveAttribute(
        'href',
        new RegExp(`/obligations\\?year=${year}$`)
      )
    } else {
      await expect(obligations).toHaveCount(0)
    }
  }
}
