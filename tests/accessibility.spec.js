import { test } from '../fixtures/pages.fixture.js'
import { TEST_USER_NAME } from '../data/csoc.data.js'
import { getOrgId } from '../utils/waste-obligations-api.js'
import {
  findOnlySubmittedDeclaration,
  resetOrgDeclarations
} from '../utils/test-setup.js'
import { usesPackagingEntryPoint } from '../utils/journey-entry-point.js'
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

async function startCsocJourney({
  account,
  landingPage,
  obligationsPage,
  csocAboutPage
}) {
  await landingPage.goto(account)
  if (usesPackagingEntryPoint()) {
    await landingPage.goToObligations()
    await obligationsPage.expectLoaded()
    await obligationsPage.startCsocSubmission()
  }
  await csocAboutPage.expectLoaded()
}

async function openCsocView({
  account,
  request,
  year,
  obligationsPage,
  csocViewPage
}) {
  if (usesPackagingEntryPoint()) {
    await obligationsPage.goto(account)
    await obligationsPage.openCertificateHub()
  } else {
    const declaration = await findOnlySubmittedDeclaration(
      request,
      getOrgId(account),
      year
    )
    await csocViewPage.goto(account, declaration.id)
  }
  await csocViewPage.expectLoaded(year)
}

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
      request,
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
      await startCsocJourney({
        account: 'dp',
        landingPage,
        obligationsPage,
        csocAboutPage
      })

      await test.step('DP > CSOC About page', async () => {
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

      // Packaging reaches View through its certificate hub; the direct entry
      // point loads the submitted declaration's view route instead.
      await test.step('DP > CSOC View page', async () => {
        await openCsocView({
          account: 'dp',
          request,
          year,
          obligationsPage,
          csocViewPage
        })
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
      request,
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
      await startCsocJourney({
        account: 'cso',
        landingPage,
        obligationsPage,
        csocAboutPage
      })

      await test.step('CSO > CSOC About page', async () => {
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

      // Packaging reaches View through its statement hub; the direct entry
      // point loads the submitted declaration's view route instead.
      await test.step('CSO > CSOC View page', async () => {
        await openCsocView({
          account: 'cso',
          request,
          year,
          obligationsPage,
          csocViewPage
        })
        await analyseAccessibility(page, 'cso-csoc-view')
      })

      await test.step('CSO > Assert no accessibility issues', () => {
        assertNoAccessibilityIssues()
      })
    })
  })
})
