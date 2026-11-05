import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

// The CDP page shown for 2025 and earlier: there are no obligations to manage
// and the certificate or statement of compliance was processed outside the
// service. Its heading is found by role within the main content, and its text
// is asserted with toHaveText so a failure shows the text received.
export class ComplianceRecordPage extends BasePage {
  constructor(page) {
    super(page)
    const main = page.getByRole('main')

    this.main = main
    this.heading = main.getByRole('heading', { level: 1 })
    this.prnsCard = main.getByRole('heading', { level: 2 })
    this.regulatorEmailLink = main.getByRole('link', { name: /@/ })
  }

  async expectLoadedFor(year, account) {
    const document = account === 'cso' ? 'statement' : 'certificate'

    await expect(this.heading).toHaveText(
      new RegExp(`^your ${document} of compliance record for ${year}$`, 'i')
    )
  }

  async expectProcessedOutsideService(year, account) {
    const documents = account === 'cso' ? 'statements' : 'certificates'

    await expect(this.main).toContainText(
      `We cannot show ${documents} of compliance for ${year}, because they were processed outside the service.`
    )
  }

  async expectRegulatorContact() {
    await expect(this.regulatorEmailLink).toBeVisible()
  }
}
