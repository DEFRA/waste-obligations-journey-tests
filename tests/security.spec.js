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
import {
  getJourneyBaseUrl,
  usesPackagingEntryPoint
} from '../utils/journey-entry-point.js'

// Single worker owns each org's declaration state across submit → cancel.
test.describe.configure({ mode: 'serial' })

// All authenticated pages of the deployed application live under the DEFRA
// estate. The epr-local-environment instead uses the configured local host.
// After every navigation we re-assert that we're still at an application host:
// a silent 302 to B2C would otherwise be invisible, since the page-object
// `expectLoaded` checks can pass on heading-like elements of an error page.
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const APP_HOST =
  process.env.ENVIRONMENT === 'local'
    ? new RegExp(
        `^https?://${escapeRegExp(new URL(getJourneyBaseUrl()).host)}(?:/|$)`
      )
    : /\.defra\.cloud/

const walkCsocJourney = ({ account, prefix, page, request, pages }) => {
  const {
    landingPage,
    obligationsPage,
    csocAboutPage,
    csocSubmissionPage,
    csocConfirmationPage,
    csocViewPage
  } = pages

  return async () => {
    // Doubled vs accessibility (300s) because every request adds 100-500ms of
    // ZAP overhead, and ZAP_ACTIVE=1 fans out scan jobs in parallel.
    test.setTimeout(600_000)
    const orgId = getOrgId(account)
    const year = new Date().getFullYear()
    let submittedDeclaration

    await test.step(`${prefix} > Landing page`, async () => {
      await landingPage.goto(account)
      await expect(page).toHaveURL(APP_HOST)
    })

    await test.step(`${prefix} > Obligations page`, async () => {
      if (usesPackagingEntryPoint()) {
        await landingPage.goToObligations()
        await obligationsPage.expectLoaded()
      } else {
        await csocAboutPage.expectLoaded()
      }
      await expect(page).toHaveURL(APP_HOST)
    })

    await test.step(`${prefix} > CSOC About page`, async () => {
      if (usesPackagingEntryPoint()) {
        await obligationsPage.startCsocSubmission()
      }
      await csocAboutPage.expectLoaded()
      await expect(page).toHaveURL(APP_HOST)
    })

    await test.step(`${prefix} > CSOC Check-and-submit page`, async () => {
      await csocAboutPage.clickContinue()
      await csocSubmissionPage.expectLoaded()
      await expect(page).toHaveURL(APP_HOST)
    })

    await test.step(`${prefix} > CSOC Confirmation page`, async () => {
      await csocSubmissionPage.submit(TEST_USER_NAME)
      await csocConfirmationPage.expectSubmitted(year)
      submittedDeclaration = await findOnlySubmittedDeclaration(
        request,
        orgId,
        year
      )
      await expect(page).toHaveURL(APP_HOST)
    })

    await test.step(`${prefix} > CSOC View page`, async () => {
      if (usesPackagingEntryPoint()) {
        await obligationsPage.goto(account)
        await obligationsPage.openCertificateHub()
      } else {
        await csocViewPage.goto(account, submittedDeclaration.id)
      }
      await csocViewPage.expectLoaded(year)
    })

    await test.step(`${prefix} > Obligations page — resubmit state`, async () => {
      await setDeclarationStatus(
        request,
        orgId,
        submittedDeclaration.id,
        DECLARATION_STATUS.Cancelled,
        'Security-test cancel',
        account
      )
      if (usesPackagingEntryPoint()) {
        await obligationsPage.goto(account)
        await obligationsPage.expectResubmitCardVisible()
      } else {
        await landingPage.goto(account)
        await csocAboutPage.expectLoaded()
        await csocAboutPage.expectCanSubmit()
      }
      await expect(page).toHaveURL(APP_HOST)
    })
  }
}

test.describe('Security scan — CSOC journey', () => {
  test.beforeAll(async () => {
    await resetOrgDeclarations('dp')
    await resetOrgDeclarations('cso')
  })

  // Pure navigation — no per-page scans. When PROFILE=security the entrypoint
  // points the browser at a ZAP daemon via HTTP_PROXY, ZAP records every
  // request/response, and the entrypoint fetches the HTML report after the
  // test exits.

  test.describe('DP', () => {
    test.use({ storageState: 'playwright/.auth/dp.json' })

    test('walk every page so ZAP sees the full traffic', async ({
      page,
      request,
      landingPage,
      obligationsPage,
      csocAboutPage,
      csocSubmissionPage,
      csocConfirmationPage,
      csocViewPage
    }) => {
      await walkCsocJourney({
        account: 'dp',
        prefix: 'DP',
        page,
        request,
        pages: {
          landingPage,
          obligationsPage,
          csocAboutPage,
          csocSubmissionPage,
          csocConfirmationPage,
          csocViewPage
        }
      })()
    })
  })

  test.describe('CSO', () => {
    test.use({ storageState: 'playwright/.auth/cso.json' })

    test('walk every page so ZAP sees the full traffic', async ({
      page,
      request,
      landingPage,
      obligationsPage,
      csocAboutPage,
      csocSubmissionPage,
      csocConfirmationPage,
      csocViewPage
    }) => {
      await walkCsocJourney({
        account: 'cso',
        prefix: 'CSO',
        page,
        request,
        pages: {
          landingPage,
          obligationsPage,
          csocAboutPage,
          csocSubmissionPage,
          csocConfirmationPage,
          csocViewPage
        }
      })()
    })
  })
})
