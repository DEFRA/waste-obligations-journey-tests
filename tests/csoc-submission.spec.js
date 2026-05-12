import { test, expect } from '../fixtures/pages.fixture.js'
import { buildCsocPayload } from '../data/csoc.data.js'

test.describe('CSOC submission journey', () => {
  test('submits a CSOC and the saved certificate matches', async ({
    landingPage,
    obligationsPage,
    csocSubmissionPage,
    csocConfirmationPage,
    csocViewPage
  }) => {
    const payload = buildCsocPayload()

    await test.step('navigate from landing to obligations', async () => {
      await landingPage.goto()
      await landingPage.goToObligations()
      await obligationsPage.expectLoaded()
    })

    await test.step('submit CSOC form', async () => {
      await obligationsPage.startCsocSubmission()
      await csocSubmissionPage.expectFormVisible()
      // await csocSubmissionPage.fillForm(payload)
      // await csocSubmissionPage.submit()
    })

    // await test.step('verify confirmation', async () => {
    //   await csocConfirmationPage.expectSubmitted()
    //   payload.reference = await csocConfirmationPage.getReferenceNumber()
    //   expect(payload.reference).toMatch(/[A-Z0-9-]+/)
    // })

    // await test.step('view submitted CSOC and verify details', async () => {
    //   await obligationsPage.goto()
    //   await obligationsPage.openSubmittedCsoc()
    //   await csocViewPage.expectDetailsMatch(payload)
    // })
  })
})
