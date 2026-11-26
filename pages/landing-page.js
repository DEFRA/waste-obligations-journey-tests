import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'
import {
  FEATURE_SHOW_MULTI_YEAR_OBLIGATIONS,
  isFeatureFlagEnabled,
  usesShowPrnsOnCdp
} from '../utils/environment-features.js'
import {
  getJourneyStartPath,
  usesPackagingEntryPoint
} from '../utils/journey-entry-point.js'
import { ensureProxySessionForWebKit } from '../utils/proxy-session.js'

export class LandingPage extends BasePage {
  constructor(page) {
    super(page)
    this.path = '/report-data'
    this.manageObligationsLink = page.getByRole('link', {
      name: /manage your \d{4} recycling/i
    })
    // Shown instead of manageObligationsLink when ShowMultiYearObligations is
    // enabled: no year in the link text, since the year is chosen on the next
    // page rather than being known up front.
    this.manageRecyclingObligationsLink = page.getByRole('link', {
      name: /^manage recycling obligations$/i
    })
  }

  async goto(account = 'dp') {
    if (!usesPackagingEntryPoint()) {
      await this.gotoPath(getJourneyStartPath(account))
      return
    }
    await this.gotoPath(this.path)
  }

  async expectLoaded() {
    // Only one of these renders, depending on ShowMultiYearObligations.
    await expect(
      this.manageObligationsLink.or(this.manageRecyclingObligationsLink)
    ).toBeVisible()
  }

  async goToObligations() {
    if (!usesPackagingEntryPoint()) {
      throw new Error(
        'The waste-obligations entry point opens the CSOC about page directly.'
      )
    }
    await this.manageObligationsLink.click()
  }

  async goToChooseYear() {
    if (!usesPackagingEntryPoint()) {
      throw new Error(
        'The waste-obligations entry point opens the CSOC about page directly.'
      )
    }
    // With PRNs on CDP the tile leaves Azure for the CDP proxy. Without a proxy
    // session that click bounces through B2C sign-in, which crashes Playwright's
    // WebKit backend, as the CSoC handoff and the PRN links would.
    const href = await this.manageRecyclingObligationsLink.getAttribute('href')
    await ensureProxySessionForWebKit(
      this.page,
      new URL(href, this.page.url()).href
    )
    await this.manageRecyclingObligationsLink.click()
  }

  // With PRNs on CDP the tile opens the EPR Next Gen Choose a year page for the
  // organisation or scheme; otherwise the Packaging one.
  async expectChooseYearOpened() {
    await expect(this.page).toHaveURL(
      usesShowPrnsOnCdp()
        ? /\/(producer|cso)\/[0-9a-f-]{36}\/obligations\/choose-year(\?|$)/
        : /\/report-data\/choose-your-recycling-obligations-year(\?|$)/
    )
  }

  // Follows FEATURE_SHOW_MULTI_YEAR_OBLIGATIONS. A missing tile is a failure,
  // not a skipped feature. Returns true when Azure year selection was used.
  async openObligations(chooseYearPage, obligationsPage, year) {
    if (isFeatureFlagEnabled(FEATURE_SHOW_MULTI_YEAR_OBLIGATIONS)) {
      await this.goToChooseYear()
      await this.expectChooseYearOpened()
      await chooseYearPage.expectLoaded()
      await chooseYearPage.selectYear(year)
      await chooseYearPage.clickContinue()
      await obligationsPage.expectLoadedForYear(year)
      return true
    }

    await this.goToObligations()
    await obligationsPage.expectLoaded()
    return false
  }
}
