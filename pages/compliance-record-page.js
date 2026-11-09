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

  downloadLink(year) {
    return this.main.getByRole('link', {
      name: `Download a list of your PRNs and PERNs for ${year} (CSV)`
    })
  }

  // What is wrong with the download response, or an empty list. An
  // organisation with no PRNs for the year gets the empty page, not a file.
  async findDownloadProblems(response, year) {
    const contentType = response.headers()['content-type'] ?? ''
    const disposition = response.headers()['content-disposition'] ?? ''
    const body = await response.text()
    const [header] = body.split('\r\n')

    if (!contentType.includes('text/csv')) {
      return body.includes(
        `You have no PRNs or PERNs issued to your ${year} recycling obligations.`
      )
        ? []
        : [`neither a CSV nor the empty page was returned (${contentType})`]
    }

    return [
      disposition.includes(`attachment; filename="PRNDetail_${year}.csv"`)
        ? null
        : `Content-Disposition was "${disposition}"`,
      header.startsWith('PRN or PERN number,')
        ? null
        : `header row was "${header}"`,
      header.split(',').includes('Obligation year')
        ? null
        : `no Obligation year column in "${header}"`
    ].filter(Boolean)
  }
}
