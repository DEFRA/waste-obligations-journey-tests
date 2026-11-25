import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'
import { noteType } from '../utils/prn-selection.js'

// "Which year's recycling obligations do you want to accept this PRN
// towards?": offered for December waste from 1 December to 31 January, when
// the note can count towards either year. Not to be confused with the
// obligations' Choose a year page (choose-year-page.js).
export class PrnChooseYearPage extends BasePage {
  constructor(page) {
    super(page)
    this.continueButton = page.getByRole('button', {
      name: 'Continue',
      exact: true
    })
    this.errorSummary = page.locator('.govuk-error-summary')
  }

  heading(prn) {
    return this.page.getByRole('heading', {
      name: new RegExp(
        `^Which year.s recycling obligations do you want to accept this ${noteType(prn)} towards\\?$`,
        'i'
      ),
      level: 1
    })
  }

  async expectLoaded(prn) {
    await expect(this.page).toHaveURL((url) =>
      url.pathname.endsWith(`/prns/${prn.id}/choose-year`)
    )
    await expect(this.heading(prn)).toBeVisible()
  }

  async continueWithoutChoosing() {
    await this.continueButton.click()
  }

  async expectSelectYearError() {
    await expect(this.errorSummary).toBeVisible()
    await expect(
      this.errorSummary.getByRole('link', {
        name: 'Select the year to accept into'
      })
    ).toBeVisible()
  }
}
