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
    await expect(this.manageObligationsLink).toBeVisible()
  }

  async goToObligations() {
    if (!usesPackagingEntryPoint()) {
      throw new Error(
        'The waste-obligations entry point opens the CSOC about page directly.'
      )
    }
    await this.manageObligationsLink.click()
  }
}
