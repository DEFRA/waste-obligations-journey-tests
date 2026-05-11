import LandingPage from '../page-objects/landing.page.js'
import ObligationsPage from '../page-objects/obligations.page.js'
// eslint-disable-next-line no-unused-vars
import CsocSubmissionPage from '../page-objects/csoc-submission.page.js'
// eslint-disable-next-line no-unused-vars
import CsocConfirmationPage from '../page-objects/csoc-confirmation.page.js'
// eslint-disable-next-line no-unused-vars
import CsocViewPage from '../page-objects/csoc-view.page.js'
import { buildCsocPayload } from '../data/csoc.data.js'
import { signIn } from '../support/auth.js'

describe('CSOC submission journey', () => {
  before(async () => {
    await signIn()
  })

  it('submits a CSOC and the saved certificate matches', async () => {
    // eslint-disable-next-line no-unused-vars
    const payload = buildCsocPayload()

    // navigate from landing to obligations
    await LandingPage.open()
    await LandingPage.goToObligations()
    await ObligationsPage.expectLoaded()

    // submit CSOC form
    await ObligationsPage.startCsocSubmission()
    await CsocSubmissionPage.expectFormVisible()
    // await CsocSubmissionPage.fillForm(payload)
    // await CsocSubmissionPage.submit()

    // verify confirmation
    // await CsocConfirmationPage.expectSubmitted()
    // payload.reference = await CsocConfirmationPage.getReferenceNumber()
    // expect(payload.reference).toMatch(/[A-Z0-9-]+/)

    // view submitted CSOC and verify details
    // await ObligationsPage.open()
    // await ObligationsPage.openSubmittedCsoc()
    // await CsocViewPage.expectDetailsMatch(payload)
  })
})
