import { test, expect } from '../fixtures/pages.fixture.js'
import { getPrnUrl } from '../utils/journey-entry-point.js'
import { logJourney } from '../utils/journey-log.js'
import { reportSkippedSteps } from '../utils/skipped-steps.js'
import {
  FEATURE_MANAGE_OBLIGATIONS,
  pageNotFoundHeading,
  readBooleanEnv,
  skipUnlessPrnsConfigured
} from '../utils/environment-features.js'
import { getOrgId, listAcceptedPrns } from '../utils/waste-obligations-api.js'

// Opens a PRN that is already accepted and checks the accepted confirmation
// view. Nothing is accepted here: the journey never changes PRN state.
const ACCOUNTS = [
  { account: 'dp', label: 'DP', storageState: 'playwright/.auth/dp.json' },
  { account: 'cso', label: 'CSO', storageState: 'playwright/.auth/cso.json' }
]

for (const { account, label, storageState } of ACCOUNTS) {
  test.describe(`Accepted PRN view (${label})`, () => {
    test.use({ storageState })

    test('shows the accepted confirmation view', async ({
      page,
      request,
      prnPage
    }) => {
      skipUnlessPrnsConfigured()

      // ENVIRONMENT identifies the target. Local and the shared Docker action
      // seed accepted PRNs; deployed targets are not guaranteed to have one.
      const requirePrnData = process.env.ENVIRONMENT === 'local'
      const prn = await test.step('read an accepted PRN', async () => {
        const [first] = await listAcceptedPrns(request, getOrgId(account))
        return first
      })
      if (!prn) {
        expect(
          requirePrnData,
          'The local journey fixture must contain an accepted PRN.'
        ).toBe(false)
        const warning =
          'No accepted PRN on this deployed environment; the accepted view was not checked.'
        logJourney(test.info(), `WARNING: ${warning}`)
        test.info().annotations.push({ type: 'warning', description: warning })
        test.skip(true, warning)
      }

      await test.step(`open accepted ${prn.type} ${prn.number}`, async () => {
        await page.goto(
          getPrnUrl(account, prn.id, prn.obligationYear).toString(),
          { timeout: 60_000 }
        )
        await expect(pageNotFoundHeading(page)).toHaveCount(0)
      })

      const obligationsButton = readBooleanEnv(FEATURE_MANAGE_OBLIGATIONS)
      if (obligationsButton === undefined) {
        await reportSkippedSteps(
          'obligations progress button',
          `${FEATURE_MANAGE_OBLIGATIONS} is not set for this runner`
        )
      }

      await test.step('check the accepted confirmation view', async () => {
        await prnPage.expectLoadedForAcceptedPrn(prn, { obligationsButton })
      })
    })
  })
}
