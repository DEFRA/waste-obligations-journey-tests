import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'
import { noteType } from '../utils/prn-selection.js'
import {
  REJECTED_STATUS_LABEL,
  rejectedConfirmationHeading
} from '../utils/prn-confirmation.js'

export const GO_BACK_OPTION_NAME = 'No, go back'

export function confirmRejectOptionName(prn) {
  return `Yes, reject this ${noteType(prn)}`
}

// "Are you sure you want to reject this PRN?": two radios and a Continue
// button. Only the local reject journey answers "Yes", on a note it seeded.
export class PrnConfirmRejectPage extends BasePage {
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
      name: `Are you sure you want to reject this ${noteType(prn)}?`,
      level: 1
    })
  }

  option(name) {
    return this.page.getByRole('radio', { name, exact: true })
  }

  async expectLoaded(prn) {
    await expect(this.page).toHaveURL((url) =>
      url.pathname.endsWith(`/prns/${prn.id}/confirm-reject`)
    )
    await expect(this.heading(prn)).toBeVisible()
    await expect(
      this.page.getByText('You will not be able to accept it later')
    ).toBeVisible()
    await expect(this.option(confirmRejectOptionName(prn))).not.toBeChecked()
    await expect(this.option(GO_BACK_OPTION_NAME)).not.toBeChecked()
    await expect(this.continueButton).toBeEnabled()
    // The default (green) button: not the red warning or grey secondary style
    // the old "Yes, reject" and "No, go back" buttons used.
    await expect(this.continueButton).not.toHaveClass(
      /govuk-button--(warning|secondary)/
    )
    await expect(
      this.page.getByRole('button', { name: /^(Yes, reject|No, go back)$/ })
    ).toHaveCount(0)
    await expect(
      this.page.getByRole('link', { name: 'Back', exact: true })
    ).toHaveAttribute('href', new RegExp(`/prns/${prn.id}\\?year=`))
  }

  async continueWithoutChoosing() {
    await this.continueButton.click()
  }

  async expectChooseOptionError() {
    await expect(this.errorSummary).toBeVisible()
    await expect(
      this.errorSummary.getByRole('link', {
        name: 'You must choose an option'
      })
    ).toBeVisible()
    await expect(this.page.locator('.govuk-error-message')).toContainText(
      'You must choose an option'
    )
  }

  async reject(prn) {
    await this.option(confirmRejectOptionName(prn)).check()
    await this.continueButton.click()
  }

  // The PRN page straight after rejecting: the confirmation banner and the
  // Rejected status.
  async expectRejectionConfirmation(prn) {
    await expect(
      this.page.locator(
        '.govuk-notification-banner--success .govuk-notification-banner__heading'
      )
    ).toHaveText(rejectedConfirmationHeading(noteType(prn)))
    await expect(this.page.locator('.prn-hide-in-pdf .govuk-tag')).toHaveText(
      REJECTED_STATUS_LABEL
    )
  }

  async goBack() {
    await this.option(GO_BACK_OPTION_NAME).check()
    await this.continueButton.click()
  }
}
