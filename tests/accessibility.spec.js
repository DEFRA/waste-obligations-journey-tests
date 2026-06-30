import { test } from '../fixtures/pages.fixture.js'
import { TEST_USER_NAME } from '../data/csoc.data.js'
import { resetOrgDeclarations } from '../utils/test-setup.js'
import {
  initialiseAccessibilityChecking,
  analyseAccessibility,
  generateAccessibilityReports,
  generateAccessibilityReportIndex,
  assertNoAccessibilityIssues
} from './accessibility-checking.js'

// Shared backend org: keep serial so a single worker owns the lifecycle state
// across the submit → view scans.
test.describe.configure({ mode: 'serial' })

test.describe('Accessibility testing — CSOC journey', () => {
  test.beforeAll(async () => {
    await resetOrgDeclarations('dp')
    await resetOrgDeclarations('cso')
    await initialiseAccessibilityChecking()
  })

  test.afterAll(async () => {
    generateAccessibilityReports('csoc-journey')
    generateAccessibilityReportIndex()
  })

  test.describe('DP', () => {
    test.use({ storageState: 'playwright/.auth/dp.json' })

    test('scan the four CSOC pages', async ({
      page,
      landingPage,
      obligationsPage,
      csocAboutPage,
      csocSubmissionPage,
      csocConfirmationPage,
      csocViewPage
    }) => {
      test.setTimeout(300_000)

      const year = new Date().getFullYear()

      // Navigate from landing to the start of the CSOC journey — these pages
      // are out of scope for the accessibility scan, so we just step through.
      await landingPage.goto()
      await landingPage.goToObligations()
      await obligationsPage.expectLoaded()
      await obligationsPage.startCsocSubmission()

      await test.step('DP > CSOC About page', async () => {
        await csocAboutPage.expectLoaded()
        await analyseAccessibility(page, 'dp-csoc-about')
      })

      await test.step('DP > CSOC Check-and-submit page', async () => {
        await csocAboutPage.clickContinue()
        await csocSubmissionPage.expectLoaded()
        await analyseAccessibility(page, 'dp-csoc-check-and-submit')
      })

      await test.step('DP > CSOC Confirmation page', async () => {
        await csocSubmissionPage.submit(TEST_USER_NAME)
        await csocConfirmationPage.expectSubmitted(year)
        await analyseAccessibility(page, 'dp-csoc-confirmation')
      })

      // Hub → View are only reachable via the "view your certificate" flow on
      // the obligations page after a successful submission.
      await test.step('DP > CSOC View page', async () => {
        await obligationsPage.goto()
        await obligationsPage.openCertificateHub()
        await csocViewPage.expectLoaded(year)
        await analyseAccessibility(page, 'dp-csoc-view')
      })

      await test.step('DP > Assert no accessibility issues', () => {
        assertNoAccessibilityIssues()
      })
    })
  })

  test.describe('CSO', () => {
    test.use({ storageState: 'playwright/.auth/cso.json' })

    test('scan the four CSOC pages', async ({
      page,
      landingPage,
      obligationsPage,
      csocAboutPage,
      csocSubmissionPage,
      csocConfirmationPage,
      csocViewPage
    }) => {
      test.setTimeout(300_000)

      const year = new Date().getFullYear()

      // Navigate from landing to the start of the CSOC journey — these pages
      // are out of scope for the accessibility scan, so we just step through.
      await landingPage.goto()
      await landingPage.goToObligations()
      await obligationsPage.expectLoaded()
      await obligationsPage.startCsocSubmission()

      await test.step('CSO > CSOC About page', async () => {
        await csocAboutPage.expectLoaded()
        await analyseAccessibility(page, 'cso-csoc-about')
      })

      await test.step('CSO > CSOC Check-and-submit page', async () => {
        await csocAboutPage.clickContinue()
        await csocSubmissionPage.expectLoaded()
        await analyseAccessibility(page, 'cso-csoc-check-and-submit')
      })

      await test.step('CSO > CSOC Confirmation page', async () => {
        await csocSubmissionPage.submit(TEST_USER_NAME)
        await csocConfirmationPage.expectSubmitted(year)
        await analyseAccessibility(page, 'cso-csoc-confirmation')
      })

      // Hub → View are only reachable via the "view your certificate" flow on
      // the obligations page after a successful submission.
      await test.step('CSO > CSOC View page', async () => {
        await obligationsPage.goto()
        await obligationsPage.openCertificateHub()
        await csocViewPage.expectLoaded(year)
        await analyseAccessibility(page, 'cso-csoc-view')
      })

      await test.step('CSO > Assert no accessibility issues', () => {
        assertNoAccessibilityIssues()
      })
    })
  })
})
