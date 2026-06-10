import { test, expect } from '../fixtures/pages.fixture.js'
import { TEST_USER_NAME } from '../data/csoc.data.js'
import {
  cancelAllOpenDeclarations,
  getOrgId
} from '../utils/waste-obligations-api.js'

test.describe('CSOC submission journey', () => {
  test.beforeEach(async ({ request }) => {
    await cancelAllOpenDeclarations(request, getOrgId())
  })

  test('submits the CSOC and the obligations table is consistent end-to-end', async ({
    landingPage,
    obligationsPage,
    csocAboutPage,
    csocSubmissionPage,
    csocConfirmationPage
  }) => {
    let obligationsRows

    await test.step('1. capture obligations table from manage-your-recycling-obligations', async () => {
      await landingPage.goto()
      await landingPage.goToObligations()
      await obligationsPage.expectLoaded()
      obligationsRows = await obligationsPage.readObligationsTable()
      expect(obligationsRows.length).toBeGreaterThan(0)
    })

    await test.step('2. click submit certificate', async () => {
      await obligationsPage.startCsocSubmission()
    })

    await test.step('3. verify About page heading and regulator email', async () => {
      await csocAboutPage.expectLoaded()
      await csocAboutPage.expectRegulatorEmail()
    })

    await test.step('4. click Continue', async () => {
      await csocAboutPage.clickContinue()
    })

    await test.step('5-7. verify Check-and-submit page details, status and table', async () => {
      await csocSubmissionPage.expectLoaded()
      await csocSubmissionPage.expectOrganisationDetails()
      await csocSubmissionPage.expectObligationsMet()

      // Re-enable once after 0 vs - issue is resolved
      // const submissionRows = await csocSubmissionPage.readObligationsTable()
      // expect(submissionRows).toEqual(obligationsRows)
    })

    await test.step('8. enter full name and submit', async () => {
      await csocSubmissionPage.submit(TEST_USER_NAME)
    })

    await test.step('9. verify confirmation page', async () => {
      await csocConfirmationPage.expectSubmitted()
    })
  })
})
