import { test, expect } from '../fixtures/pages.fixture.js'
import {
  expectSeededOnLocal,
  skipUnlessPrnsConfigured
} from '../utils/environment-features.js'
import { getOrgId, listAcceptedPrns } from '../utils/waste-obligations-api.js'
import { noteType, PRN_ACCOUNTS } from '../utils/prn-selection.js'

// Opens a PRN that is already accepted, checks the accepted confirmation view
// loads for it, and follows it on to the PRNs list. Nothing is accepted here:
// the journey never changes PRN state. The view's detailed content is covered
// by waste-obligations-frontend's route tests.
// Each account opens a different type, so every run covers both the PRN and
// the PERN wording. Selecting by type rather than by number works with the CI
// WireMock data and with a full local stack, which seed different PRNs.
for (const { account, label, storageState, prnType } of PRN_ACCOUNTS) {
  test.describe(`Accepted ${prnType} view (${label})`, () => {
    test.use({ storageState })

    test('opens an accepted note and goes on to the PRNs list', async ({
      page,
      request,
      prnPage,
      prnsListPage
    }) => {
      skipUnlessPrnsConfigured()

      const prn = await test.step(`read an accepted ${prnType}`, async () => {
        const prns = await listAcceptedPrns(request, getOrgId(account))
        return prns.find((candidate) => noteType(candidate) === prnType)
      })

      expectSeededOnLocal(prn, `an accepted ${prnType}`)
      test.skip(
        !prn,
        `No accepted ${prnType} on this deployed environment; the accepted view was not checked.`
      )

      const year = prn.obligationYear

      await test.step(`open accepted ${prnType} ${prn.number}`, async () => {
        await prnPage.goto(account, prn)
        await prnPage.expectLoadedForAcceptedPrn(prn)
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
