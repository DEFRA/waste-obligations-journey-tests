import { test, expect } from '../fixtures/pages.fixture.js'
import { DECLARATION_STATUS, TEST_USER_NAME } from '../data/csoc.data.js'
import {
  getOrgId,
  listAwaitingPrns,
  setDeclarationStatus
} from '../utils/waste-obligations-api.js'
import {
  findOnlySubmittedDeclaration,
  resetOrgDeclarations
} from '../utils/test-setup.js'
import {
  getJourneyBaseUrl,
  getObligationMaterialUrl,
  getObligationsChooseYearUrl,
  getObligationsUrl,
  getPrnsListUrl,
  getWasteObligationsFrontendBaseUrl,
  usesPackagingEntryPoint
} from '../utils/journey-entry-point.js'
import {
  FEATURE_MANAGE_OBLIGATIONS,
  isFeatureFlagEnabled,
  skipUnlessCsocEnabled,
  skipUnlessPrnsConfigured,
  usesMultiYearObligations
} from '../utils/environment-features.js'
import {
  findAwaitingNoteOfType,
  findStandardSelectablePrn,
  PRN_ACCOUNTS
} from '../utils/prn-selection.js'
import { getComplianceYear } from '../utils/journey-clock.js'
import {
  resetAwaitingPrns,
  seedAwaitingPrns,
  seedsOwnPrns
} from '../utils/awaiting-prns.js'
import { reportSkippedSteps } from '../utils/skipped-steps.js'
import { ensureProxySessionForWebKit } from '../utils/proxy-session.js'

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
    chooseYearPage,
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

    skipUnlessCsocEnabled()

    await test.step(`${prefix} > Landing page`, async () => {
      await landingPage.goto(account)
      await expect(page).toHaveURL(APP_HOST)
      // eslint-disable-next-line playwright/no-conditional-in-test -- entry point: Packaging sign-in or direct CDP route differently
      if (usesPackagingEntryPoint()) {
        await landingPage.expectLoaded()
      }
    })

    let usedYearSelection = false
    if (usesMultiYearObligations()) {
      usedYearSelection = true

      await test.step(`${prefix} > Choose a year`, async () => {
        await landingPage.goToChooseYear()
        await chooseYearPage.expectLoaded()
        await chooseYearPage.selectYear(year)
        await chooseYearPage.clickContinue()
        await expect(page).toHaveURL(APP_HOST)
      })
    }

    await test.step(`${prefix} > Obligations page`, async () => {
      // eslint-disable-next-line playwright/no-conditional-in-test -- entry point: Packaging sign-in or direct CDP route differently
      if (usesPackagingEntryPoint()) {
        // eslint-disable-next-line playwright/no-conditional-in-test -- year selection may already have opened the obligations page
        if (!usedYearSelection) {
          await landingPage.goToObligations()
        }
        await obligationsPage.expectLoaded()
      } else {
        await csocAboutPage.expectLoaded()
      }
      await expect(page).toHaveURL(APP_HOST)
    })

    await test.step(`${prefix} > CSOC About page`, async () => {
      // eslint-disable-next-line playwright/no-conditional-in-test -- entry point: Packaging sign-in or direct CDP route differently
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
      // eslint-disable-next-line playwright/no-conditional-in-test -- entry point: Packaging sign-in or direct CDP route differently
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
      // eslint-disable-next-line playwright/no-conditional-in-test -- entry point: Packaging sign-in or direct CDP route differently
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
      chooseYearPage,
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
          chooseYearPage,
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
      chooseYearPage,
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
          chooseYearPage,
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

// 2025's obligations were met outside the service, so its year opens the
// compliance record and its PRN and PERN download.
const COMPLIANCE_RECORD_YEAR = 2025

// A CDP rebuild page opened directly. On WebKit the proxy session is warmed
// first, as the PRN page object does, so the goto is a single hop.
async function openCdpPage(page, url) {
  const href = new URL(
    url.toString(),
    getWasteObligationsFrontendBaseUrl()
  ).toString()
  await ensureProxySessionForWebKit(page, href)
  await page.goto(href, { timeout: 60_000 })
  await expect(page).toHaveURL(APP_HOST)
}

test.describe('Security scan — Manage obligations and PRNs', () => {
  // Pure navigation, as for CSoC: ZAP records every request and response of
  // the CDP rebuild pages. Data-changing steps run only where the run seeds and
  // removes its own notes (LOCAL outside CI).
  /* eslint-disable playwright/no-conditional-in-test, playwright/no-conditional-expect -- steps follow the flags and the notes the environment has */
  for (const { account, label, storageState, prnType } of PRN_ACCOUNTS) {
    test.describe(label, () => {
      test.use({ storageState })

      // Local stack only: seed the awaiting notes before the walk and remove them after,
      // which also undoes the accepts and the reject.
      test.beforeEach(() => {
        seedAwaitingPrns(account)
      })

      test.afterEach(async ({ request }) => {
        await resetAwaitingPrns(account, request)
      })

      test('walk the obligations and PRN pages so ZAP sees the full traffic', async ({
        page,
        request,
        chooseYearPage,
        obligationsPage,
        materialCalculationPage,
        complianceRecordPage,
        prnsListPage,
        prnPage,
        prnConfirmAcceptPage,
        prnConfirmRejectPage,
        prnsCheckSelectionPage,
        prnsAcceptedSelectionPage
      }) => {
        // As for the CSoC walk: every request adds ZAP overhead.
        test.setTimeout(600_000)
        const year = getComplianceYear()

        if (isFeatureFlagEnabled(FEATURE_MANAGE_OBLIGATIONS)) {
          await test.step(`${label} > Choose a year and its error`, async () => {
            await openCdpPage(page, getObligationsChooseYearUrl(account))
            await chooseYearPage.expectLoaded()
            await chooseYearPage.clickContinue()
            await chooseYearPage.expectSelectYearError()
          })

          await test.step(`${label} > Manage your ${year} recycling obligations`, async () => {
            await chooseYearPage.selectYear(year)
            await chooseYearPage.clickContinue()
            await obligationsPage.expectLoadedForYear(year)
            await expect(page).toHaveURL(APP_HOST)
          })

          await test.step(`${label} > Aluminium calculation page`, async () => {
            await openCdpPage(
              page,
              getObligationMaterialUrl(account, 'aluminium', year)
            )
            await materialCalculationPage.expectLoadedFor(year, 'aluminium')
          })

          await test.step(`${label} > ${COMPLIANCE_RECORD_YEAR} compliance record and its download`, async () => {
            await openCdpPage(
              page,
              getObligationsUrl(account, COMPLIANCE_RECORD_YEAR)
            )
            await complianceRecordPage.expectLoadedFor(
              COMPLIANCE_RECORD_YEAR,
              account
            )
            const href = await complianceRecordPage
              .downloadLink(COMPLIANCE_RECORD_YEAR)
              .getAttribute('href')
            const response = await page.request.get(
              new URL(href, page.url()).href
            )
            expect(response.status()).toBe(200)
          })
        } else {
          await reportSkippedSteps(
            'Choose a year, Manage obligations, a material calculation and the compliance record',
            'FEATURE_MANAGE_OBLIGATIONS is false for this environment'
          )
        }

        skipUnlessPrnsConfigured()

        await test.step(`${label} > PRNs list, sorted, filtered and cleared`, async () => {
          await prnsListPage.goto(getPrnsListUrl(account, year).href)
          await prnsListPage.expectLoaded()
          await expect(page).toHaveURL(APP_HOST)
          await prnsListPage.selectSort('Tonnage: (heaviest first)')
          await prnsListPage.selectMaterial('Aluminium')
          await prnsListPage.clickClearAll()
          await prnsListPage.expectLoaded()
        })

        const awaiting = await listAwaitingPrns(request, getOrgId(account))
        const prn = findAwaitingNoteOfType(awaiting, account, prnType)

        if (prn) {
          await test.step(`${label} > Accept selected with nothing ticked`, async () => {
            await prnsListPage.goto(getPrnsListUrl(account, year).href)
            await prnsListPage.clickAcceptSelected()
            await prnsListPage.expectSelectOneOrMoreError()
          })

          await test.step(`${label} > ${prnType} awaiting acceptance, then the accept question`, async () => {
            await prnPage.goto(account, prn)
            await prnPage.expectLoadedForAwaitingPrn(prn)
            await prnPage.acceptButton(prn).click()
            await prnConfirmAcceptPage.expectLoaded(prn)
            await prnConfirmAcceptPage.goBackButton.click()
            await prnPage.expectLoadedForAwaitingPrn(prn)
          })

          await test.step(`${label} > Reject question and its error`, async () => {
            await prnPage.rejectButton(prn).click()
            await prnConfirmRejectPage.expectLoaded(prn)
            await prnConfirmRejectPage.continueWithoutChoosing()
            await prnConfirmRejectPage.expectChooseOptionError()
            await prnConfirmRejectPage.goBack()
            await prnPage.expectLoadedForAwaitingPrn(prn)
          })
        } else {
          await reportSkippedSteps(
            `The ${prnType} page, the accept and reject questions and the nothing-selected error`,
            `no standard ${prnType} is awaiting acceptance on this environment`
          )
        }

        if (!seedsOwnPrns()) {
          await reportSkippedSteps(
            'Accept, reject and accept selected',
            'they change PRN data, so they run only where the run seeds and removes its own notes'
          )
          return
        }

        const [toAccept, toReject, ...rest] = [
          prn,
          ...awaiting.filter((candidate) => candidate.id !== prn?.id)
        ].filter((candidate) => findStandardSelectablePrn([candidate]))
        const toSelect = rest.slice(0, 2)
        expect(
          toSelect,
          'The local seed must hold four standard notes awaiting acceptance.'
        ).toHaveLength(2)

        await test.step(`${label} > Accept ${toAccept.number}`, async () => {
          await prnPage.goto(account, toAccept)
          await prnPage.accept(toAccept)
          await prnPage.expectAcceptedConfirmation(
            toAccept,
            toAccept.obligationYear
          )
        })

        await test.step(`${label} > Reject ${toReject.number}`, async () => {
          await prnPage.goto(account, toReject)
          await prnPage.rejectButton(toReject).click()
          await prnConfirmRejectPage.expectLoaded(toReject)
          await prnConfirmRejectPage.reject(toReject)
          await prnConfirmRejectPage.expectRejectionConfirmation(toReject)
        })

        await test.step(`${label} > Accept two selected notes`, async () => {
          await prnsListPage.goto(getPrnsListUrl(account, year).href)
          for (const selected of toSelect) {
            await prnsListPage.selectPrn(selected.number)
          }
          await prnsListPage.clickAcceptSelected()
          await prnsCheckSelectionPage.expectLoaded()
          await prnsCheckSelectionPage.clickAccept()
          await prnsAcceptedSelectionPage.expectLoaded(2, year)
          await expect(page).toHaveURL(APP_HOST)
        })
      })
    })
  }
  /* eslint-enable playwright/no-conditional-in-test, playwright/no-conditional-expect */
})
