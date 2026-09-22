import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'
import {
  getJourneyStartPath,
  usesPackagingEntryPoint
} from '../utils/journey-entry-point.js'

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
    await this.expectLoaded()
  }

  async expectLoaded() {
    // Only one of these renders, depending on ShowMultiYearObligations.
    await expect(
      this.manageObligationsLink.or(this.manageRecyclingObligationsLink)
    ).toBeVisible()
  }

  async goToChooseYear() {
    if (!usesPackagingEntryPoint()) {
      throw new Error(
        'The waste-obligations entry point opens the CSOC about page directly.'
      )
    }
    await this.manageRecyclingObligationsLink.click()
  }
}
