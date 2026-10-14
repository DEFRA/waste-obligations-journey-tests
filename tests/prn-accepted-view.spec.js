import { test, expect } from '../fixtures/pages.fixture.js'
import { getPrnUrl } from '../utils/journey-entry-point.js'
import { ensureProxySessionForWebKit } from '../utils/proxy-session.js'
import { skipUnlessPrnsConfigured } from '../utils/environment-features.js'
import { getOrgId, listAcceptedPrns } from '../utils/waste-obligations-api.js'

// Opens a PRN that is already accepted, checks the accepted confirmation view
// loads for it, and follows it on to the PRNs list. Nothing is accepted here:
// the journey never changes PRN state. The view's detailed content is covered
// by waste-obligations-frontend's route tests.
// Each account opens a different type, so every run covers both the PRN and
// the PERN wording. Selecting by type rather than by number works with the CI
// WireMock data and with a full local stack, which seed different PRNs.
const ACCOUNTS = [
  {
    account: 'dp',
    label: 'DP',
    storageState: 'playwright/.auth/dp.json',
    prnType: 'PRN'
  },
  {
    account: 'cso',
    label: 'CSO',
    storageState: 'playwright/.auth/cso.json',
    prnType: 'PERN'
  }
]

// The backend marks PERNs with type 'PERN'; everything else is a PRN.
const typeOf = (prn) => (prn.type === 'PERN' ? 'PERN' : 'PRN')

// ENVIRONMENT identifies the target. Local and the shared Docker action seed
// accepted PRNs, so a missing one fails there; deployed targets are not
// guaranteed to have one, so the test skips instead. Kept outside the test
// body to satisfy playwright/no-conditional-in-test.
function expectSeededOnLocal(prn, prnType) {
  if (process.env.ENVIRONMENT === 'local') {
    expect(
      prn,
      `The local journey fixture must contain an accepted ${prnType}.`
    ).toBeDefined()
  }
}

for (const { account, label, storageState, prnType } of ACCOUNTS) {
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
        return prns.find((p) => typeOf(p) === prnType)
      })

      expectSeededOnLocal(prn, prnType)
      test.skip(
        !prn,
        `No accepted ${prnType} on this deployed environment; the accepted view was not checked.`
      )

      const year = prn.obligationYear

      await test.step(`open accepted ${prnType} ${prn.number}`, async () => {
        const prnUrl = getPrnUrl(account, prn.id, year)
        // Deployed targets: without a proxy session the goto bounces through
        // B2C sign-in, which crashes Playwright's WebKit backend.
        await ensureProxySessionForWebKit(page, prnUrl.href)
        await page.goto(prnUrl.href, { timeout: 60_000 })
        // Still on the PRN page: not bounced to sign-in or an error route.
        await expect(page).toHaveURL((url) => url.pathname === prnUrl.pathname)
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
