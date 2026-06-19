import { test, expect } from '../fixtures/pages.fixture.js'
import { DECLARATION_STATUS, TEST_USER_NAME } from '../data/csoc.data.js'
import {
  getOrgId,
  setDeclarationStatus
} from '../utils/waste-obligations-api.js'
import {
  findOnlySubmittedDeclaration,
  resetOrgDeclarations
} from '../utils/test-setup.js'

// Single worker owns the org's declaration state across submit → cancel.
test.describe.configure({ mode: 'serial' })

// All authenticated pages of the application live on the same host. After every
// navigation we re-assert we're still on it: a silent 302 to b2clogin or an
// error page would otherwise be invisible (the only thing this spec relies on
// is page-object `expectLoaded` checks, which can pass on heading-like elements
// of an error page).
const APP_HOST = /rwd-.*\.azure\.defra\.cloud/

test.describe('Security scan — CSOC journey', () => {
  test.beforeAll(resetOrgDeclarations)

  // Pure navigation — no per-page scans. When PROFILE=security the entrypoint
  // points the browser at a ZAP daemon via HTTP_PROXY, ZAP records every
  // request/response, and the entrypoint fetches the HTML report after the
  // test exits.
  test('walk every page so ZAP sees the full traffic', async ({
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
    // Doubled vs accessibility (300s) because every request adds 100-500ms of
    // ZAP overhead, and ZAP_ACTIVE=1 fans out scan jobs in parallel.
    test.setTimeout(600_000)
    const orgId = getOrgId()
    const year = new Date().getFullYear()

    await test.step('Landing page', async () => {
      await landingPage.goto()
      await expect(page).toHaveURL(APP_HOST)
    })

    await test.step('Obligations page', async () => {
      await landingPage.goToObligations()
      await obligationsPage.expectLoaded()
      await expect(page).toHaveURL(APP_HOST)
    })

    await test.step('CSOC About page', async () => {
      await obligationsPage.startCsocSubmission()
      await csocAboutPage.expectLoaded()
      await expect(page).toHaveURL(APP_HOST)
    })

    await test.step('CSOC Check-and-submit page', async () => {
      await csocAboutPage.clickContinue()
      await csocSubmissionPage.expectLoaded()
      await expect(page).toHaveURL(APP_HOST)
    })

    await test.step('CSOC Confirmation page', async () => {
      await csocSubmissionPage.submit(TEST_USER_NAME)
      await csocConfirmationPage.expectSubmitted(year)
      await expect(page).toHaveURL(APP_HOST)
    })

    await test.step('CSOC Certificate Hub page', async () => {
      await obligationsPage.goto()
      await obligationsPage.openCertificateHub()
      await csocCertificateHubPage.expectLoaded()
      await expect(page).toHaveURL(APP_HOST)
    })

    await test.step('CSOC View page', async () => {
      await csocCertificateHubPage.goToConfirmation()
      await csocConfirmationPage.expectSubmitted(year)
      await csocConfirmationPage.goToCertificateView()
      await csocViewPage.expectLoaded(year)
    })

    await test.step('Obligations page — resubmit state', async () => {
      const submitted = await findOnlySubmittedDeclaration(request, orgId, year)
      await setDeclarationStatus(
        request,
        orgId,
        submitted.id,
        DECLARATION_STATUS.Cancelled,
        'Security-test cancel'
      )
      await obligationsPage.goto()
      await obligationsPage.expectResubmitCardVisible()
      await expect(page).toHaveURL(/manage-your-recycling-obligations/)
    })
  })
})
