import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'
import { noteType } from '../utils/prn-selection.js'
import { CONFIRM_ACCEPT_BUTTON_NAME } from './prn-page.js'

// "Are you sure you want to accept this PRN?": reached from a note's Accept
// button. Nothing is accepted until Yes, accept is pressed.
export class PrnConfirmAcceptPage extends BasePage {
  constructor(page) {
    super(page)
    this.confirmButton = page.getByRole('button', {
      name: CONFIRM_ACCEPT_BUTTON_NAME,
      exact: true
    })
    this.goBackButton = page.getByRole('button', {
      name: 'No, go back',
      exact: true
    })
  }

  heading(prn) {
    return this.page.getByRole('heading', {
      name: new RegExp(
        `^Are you sure you want to accept this ${noteType(prn)}`,
        'i'
      ),
      level: 1
    })
  }

  async expectLoaded(prn) {
    await expect(this.page).toHaveURL((url) =>
      url.pathname.endsWith(`/prns/${prn.id}/confirm-accept`)
    )
    await expect(this.heading(prn)).toBeVisible()
    await expect(this.confirmButton).toBeVisible()
    await expect(this.goBackButton).toBeVisible()
  }
}
