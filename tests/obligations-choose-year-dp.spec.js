import { test } from '../fixtures/pages.fixture.js'
import { loginAsProducerAndOpenCertificate } from '../utils/choose-year-journey.js'

// Direct Producer journey through the multi-year "Choose a year" step
// (ShowMultiYearObligations) on the packaging Account home page, down into
// the obligations-home page and the certificate-of-compliance "about" page.
// In CI the direct Waste Obligations entry point opens the certificate for
// the requested year; only the Azure navigation steps are omitted.
//
// Unlike the other specs, this one logs in explicitly as EPR_USER_EMAIL rather
// than reusing the shared dp storageState fixture, so it starts from a clean,
// unauthenticated context and verifies login succeeds before continuing.
const ACCOUNT = 'dp'
const YEAR = 2026

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Manage recycling obligations - certificate for a year (DP)', () => {
  test('log in and view the certificate of compliance for the requested year', async ({
    page,
    landingPage,
    chooseYearPage,
    obligationsPage,
    csocAboutPage
  }) => {
    await loginAsProducerAndOpenCertificate(
      { page, landingPage, chooseYearPage, obligationsPage, csocAboutPage },
      { account: ACCOUNT, year: YEAR }
    )
  })
})
