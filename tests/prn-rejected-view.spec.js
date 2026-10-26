import { test, expect } from '../fixtures/pages.fixture.js'
import {
  expectSeededOnLocal,
  skipUnlessPrnsConfigured
} from '../utils/environment-features.js'
import { getOrgId, listRejectedPrns } from '../utils/waste-obligations-api.js'
import { noteType, PRN_ACCOUNTS } from '../utils/prn-selection.js'

// MO-469. Opens a note that is already rejected, checks the review view
// (no confirmation banner), and follows it on to the PRNs list. Nothing is rejected here:
// the journey never changes PRN state. Clicking Yes, reject is covered by the
// frontend integration journeys, which own an isolated WireMock scenario.
// Each account opens a different type, so every run covers both the PRN and
// the PERN wording.
for (const { account, label, storageState, prnType } of PRN_ACCOUNTS) {
  test.describe(`Rejected ${prnType} view (${label}) MO-469`, () => {
    test.use({ storageState })

    test('opens a rejected note and goes on to the PRNs list', async ({
      page,
      request,
      prnPage,
      prnsListPage
    }) => {
      skipUnlessPrnsConfigured()

      const prn = await test.step(`read a rejected ${prnType}`, async () => {
        const prns = await listRejectedPrns(request, getOrgId(account))
        return prns.find(
          (candidate) =>
            noteType(candidate) === prnType && candidate.status === 'Rejected'
        )
      })

      expectSeededOnLocal(prn, `a rejected ${prnType}`)
      test.skip(
        !prn,
        `No rejected ${prnType} on this deployed environment; the rejected view was not checked.`
      )

      const year = prn.obligationYear

      await test.step(`open rejected ${prnType} ${prn.number}`, async () => {
        await prnPage.goto(account, prn)
        await prnPage.expectRejectionConfirmation(prn)
      })

      await test.step(`accept or reject more PRNs and PERNs for ${year}`, async () => {
        await prnPage.acceptOrRejectMore(year)
        await expect(page).toHaveURL(
          (url) =>
            url.pathname.endsWith('/prns') &&
            url.searchParams.get('year') === String(year)
        )
        await prnsListPage.expectLoaded()
      })
    })
  })
}
