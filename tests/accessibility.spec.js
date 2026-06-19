import { request as apiRequest } from '@playwright/test'
import { test, expect } from '../fixtures/pages.fixture.js'
import { DECLARATION_STATUS, TEST_USER_NAME } from '../data/csoc.data.js'
import {
  deleteAllDeclarations,
  getOrgId,
  listDeclarations,
  setDeclarationStatus
} from '../utils/waste-obligations-api.js'
import {
  initialiseAccessibilityChecking,
  analyseAccessibility,
  generateAccessibilityReports,
  generateAccessibilityReportIndex
} from './accessibility-checking.js'

// Shared backend org: keep serial so a single worker owns the lifecycle state
// across the submit → view → cancel → resubmit-state scans.
test.describe.configure({ mode: 'serial' })

async function resetOrgDeclarations() {
  const apiContext = await apiRequest.newContext({ ignoreHTTPSErrors: true })
  let primaryError
  try {
    await deleteAllDeclarations(
      apiContext,
      getOrgId(),
      new Date().getFullYear()
    )
  } catch (error) {
    primaryError = error
  }
  try {
    await apiContext.dispose()
  } catch (disposeError) {
    if (!primaryError) primaryError = disposeError
  }
  if (primaryError) throw primaryError
}

test.describe('Accessibility testing — CSOC journey', () => {
  test.beforeAll(async () => {
    await resetOrgDeclarations()
    await initialiseAccessibilityChecking()
  })

  test.afterAll(async () => {
    generateAccessibilityReports('csoc-journey')
    generateAccessibilityReportIndex()
  })

  test('scan every page from landing through resubmit state', async ({
    page,
    request,
    landingPage,
    obligationsPage,
    csocAboutPage,
    csocSubmissionPage,
    csocCertificateHubPage,
    csocConfirmationPage,
    csocViewPage
  }) => {
    test.setTimeout(300_000)
    const orgId = getOrgId()
    const year = new Date().getFullYear()

    await test.step('Landing page', async () => {
      await landingPage.goto()
      await analyseAccessibility(page, 'landing')
    })

    await test.step('Obligations page', async () => {
      await landingPage.goToObligations()
      await obligationsPage.expectLoaded()
      await analyseAccessibility(page, 'obligations')
    })

    await test.step('CSOC About page', async () => {
      await obligationsPage.startCsocSubmission()
      await csocAboutPage.expectLoaded()
      await analyseAccessibility(page, 'csoc-about')
    })

    await test.step('CSOC Check-and-submit page', async () => {
      await csocAboutPage.clickContinue()
      await csocSubmissionPage.expectLoaded()
      await analyseAccessibility(page, 'csoc-check-and-submit')
    })

    await test.step('CSOC Confirmation page', async () => {
      await csocSubmissionPage.submit(TEST_USER_NAME)
      await csocConfirmationPage.expectSubmitted(year)
      await analyseAccessibility(page, 'csoc-confirmation')
    })

    // Hub → View are only reachable via the "view your certificate" flow on
    // the obligations page after a successful submission.
    await test.step('CSOC Certificate Hub page', async () => {
      await obligationsPage.goto()
      await obligationsPage.openCertificateHub()
      await csocCertificateHubPage.expectLoaded()
      await analyseAccessibility(page, 'csoc-certificate-hub')
    })

    await test.step('CSOC View page', async () => {
      await csocCertificateHubPage.goToConfirmation()
      await csocConfirmationPage.expectSubmitted(year)
      await csocConfirmationPage.goToCertificateView()
      await csocViewPage.expectLoaded(year)
      await analyseAccessibility(page, 'csoc-view')
    })

    // PATCH the just-submitted declaration to Cancelled via the API so the
    // obligations page renders its resubmit state for the final scan.
    await test.step('Obligations page — resubmit state', async () => {
      const declarations = await listDeclarations(request, orgId, year)
      const submitted = declarations.filter(
        (d) => d.status === DECLARATION_STATUS.Submitted
      )
      expect(submitted).toHaveLength(1)
      await setDeclarationStatus(
        request,
        orgId,
        submitted[0].id,
        DECLARATION_STATUS.Cancelled,
        'Accessibility-test cancel'
      )
      await obligationsPage.goto()
      await obligationsPage.expectResubmitCardVisible()
      await analyseAccessibility(page, 'obligations-resubmit')
    })
  })
})
