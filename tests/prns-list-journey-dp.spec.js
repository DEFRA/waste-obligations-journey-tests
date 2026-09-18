import { test } from '../fixtures/pages.fixture.js'
import { getProducerPrnsPath } from '../utils/journey-entry-point.js'
import { loginAsProducerAndOpenCertificate } from '../utils/choose-year-journey.js'

const ACCOUNT = 'dp'
const YEAR = 2026

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Producer PRNs list (DP)', () => {
  test('log in and view the PRNs list for the requested year', async ({
    page,
    landingPage,
    chooseYearPage,
    obligationsPage,
    csocAboutPage,
    prnsListPage
  }) => {
    await loginAsProducerAndOpenCertificate(
      { page, landingPage, chooseYearPage, obligationsPage, csocAboutPage },
      { account: ACCOUNT, year: YEAR }
    )

    await test.step('go to the PRNs accept/reject list on waste-obligations-frontend host', async () => {
      const prnsListUrl = new URL(getProducerPrnsPath(YEAR), page.url())
      await page.goto(prnsListUrl.toString())

      await prnsListPage.expectLoaded()
    })
  })
})
