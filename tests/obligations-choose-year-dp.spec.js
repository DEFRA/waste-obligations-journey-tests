import { test } from '../fixtures/pages.fixture.js'
import { loginAsJourneyUserAndChooseYear } from '../utils/choose-year-journey.js'
import { usesPackagingEntryPoint } from '../utils/journey-entry-point.js'

// Direct Producer journey through the multi-year "Choose a year" step
// (ShowMultiYearObligations) on the packaging Account home page, down into
// the obligations-home page and the certificate-of-compliance "about" page.
// Only reachable via the packaging entry point: the waste-obligations entry
// point opens the CSOC about page directly, bypassing this flow entirely.
//
// Unlike the other specs, this one logs in explicitly as JOURNEY_USER rather
// than reusing the shared dp storageState fixture, so it starts from a clean,
// unauthenticated context and verifies login succeeds before continuing.
const ACCOUNT = 'dp'
const YEAR = 2026

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Manage recycling obligations - choose a year (JOURNEY_USER)', () => {
  test('login as JOURNEY_USER, then choose a year and view the certificate of compliance', async ({
    page,
    landingPage,
    chooseYearPage,
    obligationsPage,
    csocAboutPage
  }) => {
    test.skip(
      !usesPackagingEntryPoint(),
      'Choose a year is a packaging entry-point-only step'
    )

    await loginAsJourneyUserAndChooseYear(
      { page, landingPage, chooseYearPage, obligationsPage, csocAboutPage },
      { account: ACCOUNT, year: YEAR }
    )
  })
})
