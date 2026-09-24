import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'
import {
  describeCsocActionHref,
  getJourneyStartPath,
  usesPackagingEntryPoint
} from '../utils/journey-entry-point.js'

export class ObligationsPage extends BasePage {
  constructor(page) {
    super(page)
    this.path = '/report-data/manage-your-recycling-obligations'
    this.heading = page.getByRole('heading', {
      name: /manage your \d{4} recycling/i
    })
    this.submitCertificateButton = page.getByRole('button', {
      name: /submit your (certificate|statement)/i
    })
    this.viewCertificateButton = page.getByRole('link', {
      name: /view your (certificate|statement) of compliance/i
    })
    this.resubmitButton = page.getByRole('button', {
      name: /resubmit/i
    })
    this.acceptRejectPrnsLink = page.getByRole('link', {
      name: /accept or reject prns and perns/i
    })
    // Filter by a cell's data-header attribute rather than `getByRole('columnheader')`:
    // the responsive-table CSS hides <thead> on mobile, removing th columnheader roles.
    this.materialObligationsTable = page
      .locator('table.govuk-table')
      .filter({
        has: page.locator('td[data-header="Recycling obligations to meet"]')
      })
      .first()
  }

  async goto(account = 'dp') {
    if (!usesPackagingEntryPoint()) {
      await this.gotoPath(getJourneyStartPath(account))
      return
    }
    await this.gotoPath(this.path)
    await this.expectLoaded()
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible()
  }

  headingFor(year) {
    return this.page.getByRole('heading', {
      name: new RegExp(`manage your ${year} recycling`, 'i')
    })
  }

  async expectLoadedForYear(year) {
    await expect(this.headingFor(year)).toBeVisible()
  }

  expectCsocActionHref(href) {
    const error = describeCsocActionHref(href)
    expect(error, error ?? href).toBeNull()
  }

  async hrefFromAction(action) {
    return action.evaluate((el) => {
      const anchor = el.closest?.('a') ?? el
      if (anchor.tagName === 'A') {
        return anchor.href
      }

      return anchor.getAttribute?.('href') ?? ''
    })
  }

  async openCsocAction(action) {
    await expect(action).toBeVisible()
    const href = await this.hrefFromAction(action)
    this.expectCsocActionHref(href)
    // Do not click: WebKit/Safari closes the page on Playwright clicks of the
    // GOV.UK <a role="button"> handoff, so the fallback goto never runs.
    await this.page.goto(href, { waitUntil: 'domcontentloaded' })
    this.expectCsocActionHref(this.page.url())
  }

  async startCsocSubmission() {
    await this.openCsocAction(this.submitCertificateButton)
  }

  async openCertificateHub() {
    await this.openCsocAction(this.viewCertificateButton)
  }

  async expectSubmitCardVisible() {
    await expect(this.submitCertificateButton).toBeVisible()
    await expect(this.viewCertificateButton).toHaveCount(0)
  }

  async expectViewCardVisible() {
    await expect(this.viewCertificateButton).toBeVisible()
    await expect(this.submitCertificateButton).toHaveCount(0)
  }

  async expectResubmitCardVisible() {
    await expect(this.resubmitButton).toBeVisible()
    await expect(this.viewCertificateButton).toHaveCount(0)
  }

  async openWasteObligationsPrns() {
    const link = this.acceptRejectPrnsLink.first()
    await expect(link).toBeVisible()
    const href = await link.getAttribute('href')
    expect(
      href,
      'FEATURE_SHOW_PRNS_ON_CDP is enabled but the Azure link still points at Packaging PRNs'
    ).toMatch(/\/prns(\?|$)/)
    expect(href).not.toContain('view-awaiting-acceptance-alt')
    await Promise.all([
      this.page.waitForURL(/\/prns(\?|$)/, { waitUntil: 'domcontentloaded' }),
      link.click()
    ])
  }

  async readObligationsTable() {
    return this.readGovukTable(this.materialObligationsTable)
  }
}
