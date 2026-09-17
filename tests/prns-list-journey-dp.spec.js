import { test } from '../fixtures/pages.fixture.js'
import { getOrgId } from '../utils/waste-obligations-api.js'
import { loginAsJourneyUserAndChooseYear } from '../utils/choose-year-journey.js'
import { usesPackagingEntryPoint } from '../utils/journey-entry-point.js'

const ACCOUNT = 'dp'
const YEAR = 2026

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Producer PRNs list (JOURNEY_USER)', () => {
  test('login as JOURNEY_USER, choose a year, then view the PRNs list', async ({
    page,
    landingPage,
    chooseYearPage,
    obligationsPage,
    csocAboutPage,
    prnsListPage
  }) => {
    test.skip(
      !usesPackagingEntryPoint(),
      'Choose a year is a packaging entry-point-only step'
    )

    await loginAsJourneyUserAndChooseYear(
      { page, landingPage, chooseYearPage, obligationsPage, csocAboutPage },
      { account: ACCOUNT, year: YEAR }
    )

    const orgId = getOrgId(ACCOUNT)

    await test.step('go to the PRNs accept/reject list on waste-obligations-frontend host', async () => {
      const prnsListUrl = new URL(`/producer/${orgId}/prns/`, page.url())
      await page.goto(prnsListUrl.toString())

      await prnsListPage.expectLoaded()
    })
  })
})
