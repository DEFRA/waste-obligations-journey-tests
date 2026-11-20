import { test, expect } from '../fixtures/pages.fixture.js'
import {
  expectSeededOnLocal,
  skipUnlessPrnsConfigured
} from '../utils/environment-features.js'
import {
  getOrgId,
  listAwaitingPrns,
  listRejectedPrns
} from '../utils/waste-obligations-api.js'
import { noteType, PRN_ACCOUNTS } from '../utils/prn-selection.js'
import {
  resetAwaitingPrns,
  seedAwaitingPrns,
  seedsOwnPrns
} from '../utils/awaiting-prns.js'
import { REJECT_JOURNEY_PRN_NUMBERS } from '../data/prns.data.js'

// Opens an awaiting note and asks to reject it. The first journey answers
// "No, go back", so it never changes PRN state and runs everywhere. The second
// answers "Yes" and rejects a note, so it runs only where this run seeds its
// own notes and removes them afterwards (the local stack); elsewhere the
// frontend integration journeys cover it with an isolated WireMock scenario.
// Each account opens a different type, so the "No" journey covers both the PRN
// and the PERN wording.
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

    test('rejects a seeded note after Yes, reject and shows the confirmation', async ({
      request,
      prnPage,
      prnConfirmRejectPage
    }) => {
      skipUnlessPrnsConfigured()
      test.skip(
        !seedsOwnPrns(),
        'Rejecting changes PRN data, so it runs only where the run seeds and removes its own notes.'
      )

      const number = REJECT_JOURNEY_PRN_NUMBERS[account]

      const prn = await test.step(`read seeded note ${number}`, async () => {
        const prns = await listAwaitingPrns(request, getOrgId(account))
        return prns.find((candidate) => candidate.number === number)
      })

      expectSeededOnLocal(prn, `the seeded note ${number}`)

      await test.step(`reject ${number} through Yes, reject and Continue`, async () => {
        await prnPage.goto(account, prn)
        await prnPage.rejectButton(prn).click()
        await prnConfirmRejectPage.expectLoaded(prn)
        await prnConfirmRejectPage.reject(prn)
        await prnConfirmRejectPage.expectRejectionConfirmation(prn)
      })

      await test.step(`${number} is now rejected`, async () => {
        const rejected = await listRejectedPrns(request, getOrgId(account))
        expect(rejected.map((candidate) => candidate.id)).toContain(prn.id)
      })
    })
  })
}
