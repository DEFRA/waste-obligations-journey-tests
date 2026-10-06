import { test, expect } from '../fixtures/pages.fixture.js'
import { TEST_USER_NAME } from '../data/csoc.data.js'
import { requireEnv } from '../utils/env.js'
import { submitB2CCredentials } from '../utils/login.js'
import {
  getJourneyStartPath,
  usesPackagingEntryPoint
} from '../utils/journey-entry-point.js'
import {
  getOrgId,
  getUnsubmittedOrganisation
} from '../utils/waste-obligations-api.js'
import { reportSkippedSteps } from '../utils/skipped-steps.js'
import {
  skipUnlessCsocEnabled,
  usesMultiYearObligations
} from '../utils/environment-features.js'
import {
  findOnlySubmittedDeclaration,
  resetOrgDeclarations
} from '../utils/test-setup.js'

const ACCOUNT = 'dp'
const YEAR = 2026

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Manage recycling obligations - certificate for a year (DP)', () => {
  test.beforeAll(() => resetOrgDeclarations(ACCOUNT, YEAR))

  test('log in, submit and view the certificate of compliance for the requested year', async ({
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
    test.setTimeout(180_000)
    skipUnlessCsocEnabled()
    if (process.env.ENVIRONMENT === 'local') {
      await test.step('check the hydrated Met/NoDataYet unsubmitted recycling status', async () => {
        // The backend-owned CI fixture and normal pollers provide this case.
        // Read it before submitting, while the reset year has no declaration.
        await expect
          .poll(
            async () => {
              const organisation = await getUnsubmittedOrganisation(
                request,
                getOrgId(ACCOUNT),
                YEAR
              )
              return organisation?.recyclingObligationsMet
            },
            {
              timeout: 60_000,
              intervals: [1000],
              message:
                'The local DP 2026 Met/NoDataYet fixture must hydrate an eligible unsubmitted organisation with recyclingObligationsMet true.'
            }
          )
          .toBe(true)
      })
    } else {
      await reportSkippedSteps(
        'Controlled Met/NoDataYet unsubmitted API assertion',
        'The backend-owned synthetic calculation fixture is required only for ENVIRONMENT=local; deployed data does not verify this result'
      )
    }
    const packaging = usesPackagingEntryPoint()
    await test.step('open the entry point and sign in as the producer', async () => {
      await page.goto(getJourneyStartPath(ACCOUNT, YEAR), { timeout: 60_000 })
      await submitB2CCredentials(
        page,
        requireEnv('EPR_USER_EMAIL'),
        requireEnv('EPR_USER_PASSWORD')
      )
    })

    if (packaging) {
      await landingPage.expectLoaded()
      if (usesMultiYearObligations()) {
        await test.step('open year selection from Azure account home', async () => {
          await landingPage.goToChooseYear()
          await chooseYearPage.expectLoaded()
        })
        await test.step(`select ${YEAR} and check the obligations page`, async () => {
          await chooseYearPage.selectYear(YEAR)
          await chooseYearPage.clickContinue()
          await obligationsPage.expectLoadedForYear(YEAR)
        })
      } else {
        await reportSkippedSteps(
          'Azure choose a year',
          'FEATURE_SHOW_MULTI_YEAR_OBLIGATIONS is false for this environment'
        )
        await test.step('open obligations from Azure account home', async () => {
          await landingPage.goToObligations()
          await obligationsPage.expectLoaded()
        })
      }
      await test.step('submit the certificate from the empty-year card', async () => {
        await obligationsPage.expectSubmitCardVisible()
        await obligationsPage.startCsocSubmission()
      })
    } else {
      await reportSkippedSteps(
        'Azure account home, choose a year and open the certificate hub',
        'unavailable in the CDP-only pipeline; entered the certificate page directly for ' +
          YEAR
      )
    }

    await test.step(`submit the ${YEAR} certificate of compliance`, async () => {
      await csocAboutPage.expectLoadedForYear(YEAR)
      await csocAboutPage.clickContinue()
      await csocSubmissionPage.expectLoaded()
      await csocSubmissionPage.submit(TEST_USER_NAME)
      await csocConfirmationPage.expectSubmitted(YEAR)
    })

    await test.step('view the submitted certificate for the requested year', async () => {
      if (packaging) {
        await landingPage.goto(ACCOUNT)
        await landingPage.expectLoaded()
        await landingPage.openObligations(chooseYearPage, obligationsPage, YEAR)
        await obligationsPage.expectViewCardVisible()
        await obligationsPage.openCertificateHub()
      } else {
        const declaration = await findOnlySubmittedDeclaration(
          request,
          getOrgId(ACCOUNT),
          YEAR
        )
        await csocViewPage.goto(ACCOUNT, declaration.id)
      }
      await csocViewPage.expectLoaded(YEAR)
      await csocViewPage.expectOrgIdentity()
    })
  })
})
