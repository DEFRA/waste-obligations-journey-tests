import { test, expect } from '../fixtures/pages.fixture.js'
import {
  expectSeededOnLocal,
  skipUnlessPrnsConfigured
} from '../utils/environment-features.js'
import { getOrgId, listAwaitingPrns } from '../utils/waste-obligations-api.js'
import { noteType, PRN_ACCOUNTS } from '../utils/prn-selection.js'
import { resetAwaitingPrns, seedAwaitingPrns } from '../utils/awaiting-prns.js'

// Opens an awaiting note, asks to reject it, and answers "No, go back", so the
// journey never changes PRN state. Answering "Yes, reject" is covered by the
// frontend integration journeys, which own an isolated WireMock scenario.
// Each account opens a different type, so every run covers both the PRN and
// the PERN wording.
for (const { account, label, storageState, prnType } of PRN_ACCOUNTS) {
  test.describe(`Reject ${prnType} question (${label})`, () => {
    test.use({ storageState })

    // Local stack only: seed the awaiting notes before the journey and remove them after.
    test.beforeEach(() => {
      seedAwaitingPrns(account)
    })

    test.afterEach(async ({ request }) => {
      await resetAwaitingPrns(account, request)
    })

    test('needs an answer, then goes back to the note still awaiting acceptance', async ({
      page,
      request,
      prnPage,
      prnConfirmRejectPage
    }) => {
      skipUnlessPrnsConfigured()

      const prn = await test.step(`read an awaiting ${prnType}`, async () => {
        const prns = await listAwaitingPrns(request, getOrgId(account))
        return prns.find((candidate) => noteType(candidate) === prnType)
      })

      expectSeededOnLocal(prn, `an awaiting ${prnType}`)
      test.skip(
        !prn,
        `No ${prnType} awaiting acceptance on this deployed environment; the reject question was not checked.`
      )

      await test.step(`open awaiting ${prnType} ${prn.number} and ask to reject it`, async () => {
        await prnPage.goto(account, prn)
        await prnPage.expectLoadedForAwaitingPrn(prn)
        await prnPage.rejectButton(prn).click()
        await prnConfirmRejectPage.expectLoaded(prn)
      })

      await test.step('continue without choosing an answer', async () => {
        await prnConfirmRejectPage.continueWithoutChoosing()
        await prnConfirmRejectPage.expectChooseOptionError()
      })

      await test.step('choose No, go back and continue', async () => {
        await prnConfirmRejectPage.goBack()
        await expect(page).toHaveURL(
          (url) =>
            url.pathname.endsWith(`/prns/${prn.id}`) &&
            url.searchParams.get('year') === String(prn.obligationYear) &&
            !url.searchParams.has('confirmed')
        )
        await prnPage.expectLoadedForAwaitingPrn(prn)
      })

      await test.step(`the ${prnType} is still awaiting acceptance`, async () => {
        const awaiting = await listAwaitingPrns(request, getOrgId(account))
        expect(awaiting.map((candidate) => candidate.id)).toContain(prn.id)
      })
    })
  })
}
