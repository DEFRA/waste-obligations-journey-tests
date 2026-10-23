import { expect, test } from '../fixtures/pages.fixture.js'
import { skipUnlessPrnsConfigured } from './environment-features.js'
import { getOrgId, listAwaitingPrns } from './waste-obligations-api.js'
import { getComplianceYear } from './journey-clock.js'
import { findStandardSelectablePrnsByMaterial } from './prn-selection.js'
import { logJourney } from './journey-log.js'
import { resetAwaitingPrns, seedAwaitingPrns } from './awaiting-prns.js'
import { PAPER_GROUP_HEADING } from './check-selection.js'
import { usesPackagingEntryPoint } from './journey-entry-point.js'
import {
  OBLIGATION_MATERIAL_LABELS,
  expectedAcceptedTiles,
  parseTonnage
} from './bulk-accept.js'

// Standard PRNs can only be multi-selected in the current compliance year.
const YEAR = getComplianceYear()

// API materials to select one PRN of: paper/board, fibre and glass (shown as
// Glass Other), which the DP and CSO both have awaiting acceptance in the CI
// WireMock fixture and the epr-local-environment seed. The glass PRN is then
// removed on the check-selection page, leaving paper/board and fibre, which
// share one table.
const MATERIALS = ['Paper', 'Fibre', 'Glass']

// ENVIRONMENT identifies the target. The shared Docker action sets local, whose
// WireMock fixture seeds a PRN of both materials; a deployed target cannot
// guarantee that data.
const requirePrnData = process.env.ENVIRONMENT === 'local'

// The accept journey: the material accepted, and the name the obligations
// table gives it.
const ACCEPT_MATERIAL = 'Paper'
const ACCEPT_OBLIGATION_ROW = OBLIGATION_MATERIAL_LABELS.Paper

/**
 * Defines the multi-select PRN journeys for one account: a go-back test that
 * accepts nothing, and an @accept test that accepts one PRN. The DP and CSO
 * spec files call this with their own login, list and obligations routes.
 *
 * @param {object} options
 * @param {'dp'|'cso'} options.account the account the seed and API lookups use
 * @param {string} options.label the title prefix, eg 'Producer'
 * @param {string} options.tag the title suffix, eg 'DP'
 * @param {string} [options.storageState] the auth state file for the account;
 *   unset, the project's default applies. The CSO spec sets it to
 *   playwright/.auth/cso.json (from cso-auth.setup.js).
 * @param {Function} options.openPrnsList opens the account's PRNs list for YEAR
 * @param {Function} options.obligationsPath the account's obligations route for a year
 */
export function defineMultipleSelectionJourneys({
  account,
  label,
  tag,
  storageState,
  openPrnsList,
  obligationsPath
}) {
  if (storageState) {
    test.use({ storageState })
  }

  // Troubleshooting: if these tests fail locally with "GET organisation PRNs
  // (status=AwaitingAcceptance) failed: 500", the API could not get an OAuth
  // token from the local WireMock. The usual cause is that a run of
  // waste-obligations' Api.IntegrationTests reset the WireMock mappings on
  // localhost:9090. Restart the stack's WireMock to reload its static mappings:
  //   docker restart epr-local-environment-wiremock-1
  // Local stack only: seed the awaiting PRNs before each test and remove them after.
  test.beforeEach(() => {
    seedAwaitingPrns(account)
  })

  test.afterEach(async ({ request }) => {
    await resetAwaitingPrns(account, request)
  })

  test.describe(`${label} PRNs check selection go back (${tag})`, () => {
    // Nothing here accepts or rejects a PRN.
    test('review a selection, remove one PRN, go back and find nothing selected', async ({
      page,
      request,
      prnsListPage,
      prnsMultipleSelectionConfirmationPage
    }) => {
      skipUnlessPrnsConfigured()

      const prns =
        await test.step('find a PRN awaiting acceptance for each material', async () =>
          findStandardSelectablePrnsByMaterial(
            await listAwaitingPrns(request, getOrgId(account)),
            MATERIALS
          ))

      const missing = MATERIALS.filter((material) => !prns[material])
      /* eslint-disable playwright/no-conditional-in-test, playwright/no-conditional-expect */
      if (missing.length > 0) {
        const reason = `No standard ${YEAR} PRN awaiting acceptance for: ${missing.join(', ')}`
        expect(
          requirePrnData,
          `The local journey fixture must contain a PRN for each material. ${reason}`
        ).toBe(false)
        test.skip(true, reason)
      }
      /* eslint-enable playwright/no-conditional-in-test, playwright/no-conditional-expect */

      const selected = MATERIALS.map((material) => prns[material])
      const removed = prns.Glass

      await openPrnsList({ page, prnsListPage }, YEAR)

      await test.step('select a paper/board, a fibre and a glass other PRN', async () => {
        for (const prn of selected) {
          logJourney(test.info(), `Select ${prn.number} (${prn.material})`)
          await prnsListPage.selectPrn(prn.number)
        }
      })

      await test.step('submit the selection for review', async () => {
        await prnsListPage.clickAcceptSelected()
        await prnsMultipleSelectionConfirmationPage.expectLoaded()
      })

      await test.step('remove the glass other PRN and check it is no longer listed', async () => {
        await prnsMultipleSelectionConfirmationPage.removePrn(removed.number)

        await expect(
          page.getByRole('link', { name: removed.number, exact: true })
        ).toHaveCount(0)
      })

      await test.step('check paper/board and fibre share one table with their total', async () => {
        const paperAndFibre = [prns.Paper, prns.Fibre]
        const tables =
          await prnsMultipleSelectionConfirmationPage.readMaterialTables()

        expect(tables.map((table) => table.heading)).toEqual([
          PAPER_GROUP_HEADING
        ])
        expect(tables[0].rows.map((row) => row.number).sort()).toEqual(
          paperAndFibre.map((prn) => prn.number).sort()
        )
        expect(tables[0].totalLabel).toBe('Total')
        expect(Number(tables[0].total.replaceAll(',', ''))).toBe(
          paperAndFibre.reduce((total, prn) => total + prn.tonnage, 0)
        )
      })

      await test.step('go back to the PRNs list', async () => {
        await prnsMultipleSelectionConfirmationPage.clickGoBack()
        await prnsListPage.expectLoaded()
      })

      await test.step('check no PRN is selected on any page of the list', async () => {
        let pageNumber = 1
        await prnsListPage.expectNoPrnSelected()

        while (await prnsListPage.hasNextPage()) {
          await prnsListPage.goToNextPage()
          pageNumber++
          await prnsListPage.expectNoPrnSelected()
        }

        logJourney(test.info(), `Checked ${pageNumber} list page(s)`)
      })
    })
  })

  test.describe(`${label} accepts a PRN and sees it on manage obligations (${tag}) @accept`, () => {
    // Accepting changes data, so this runs only against the local stack, which
    // is reset between runs. A deployed target would accept real PRNs.
    test.skip(
      process.env.ENVIRONMENT !== 'local',
      'Accepting a PRN changes data; this journey runs only against the local stack.'
    )
    test.skip(
      usesPackagingEntryPoint(),
      'Starts on the CDP manage-obligations page; the Azure entry point is not covered.'
    )

    test('accept a PRN, confirm it, and check the tonnage accepted on manage obligations', async ({
      page,
      request,
      obligationsPage,
      prnsListPage,
      prnsMultipleSelectionConfirmationPage,
      prnsMultipleSelectionSuccessPage
    }) => {
      skipUnlessPrnsConfigured()

      const prn =
        await test.step(`find a standard ${YEAR} PRN awaiting acceptance for ${ACCEPT_MATERIAL}`, async () => {
          const found = findStandardSelectablePrnsByMaterial(
            await listAwaitingPrns(request, getOrgId(account)),
            [ACCEPT_MATERIAL]
          )
          expect(
            found[ACCEPT_MATERIAL],
            `No standard ${YEAR} ${ACCEPT_MATERIAL} PRN awaiting acceptance.`
          ).toBeDefined()
          return found[ACCEPT_MATERIAL]
        })

      let tonnageBefore

      await test.step('view the paper/board tonnage accepted on manage obligations', async () => {
        await page.goto(obligationsPath(YEAR), { timeout: 60_000 })
        await obligationsPage.expectLoadedForYear(YEAR)

        const accepted = await obligationsPage.readAcceptedTonnages()
        expect(
          accepted[ACCEPT_OBLIGATION_ROW],
          `The obligations table has no "${ACCEPT_OBLIGATION_ROW}" row.`
        ).toBeDefined()
        tonnageBefore = parseTonnage(accepted[ACCEPT_OBLIGATION_ROW])
        logJourney(
          test.info(),
          `${ACCEPT_OBLIGATION_ROW}: ${tonnageBefore} tonnes accepted before accepting ${prn.number} (${prn.tonnage} tonnes)`
        )
      })

      await test.step(`open the PRNs list, select ${prn.number} and accept`, async () => {
        await openPrnsList({ page, prnsListPage }, YEAR)
        await prnsListPage.selectPrn(prn.number)
        await prnsListPage.clickAcceptSelected()
        await prnsMultipleSelectionConfirmationPage.expectLoaded()
        await prnsMultipleSelectionConfirmationPage.clickAccept()
      })

      await test.step('check the confirmation shows the accepted PRN and its tonnage', async () => {
        await prnsMultipleSelectionSuccessPage.expectLoaded(1, YEAR)

        const tiles = await prnsMultipleSelectionSuccessPage.readTiles()
        expect(tiles).toHaveLength(1)
        expect(tiles).toEqual(
          expectedAcceptedTiles([prn]).map(({ tonnageText, description }) => ({
            tonnageText,
            description
          }))
        )
      })

      await test.step(`go back to manage obligations for ${YEAR} from the confirmation`, async () => {
        await prnsMultipleSelectionSuccessPage.openObligationsProgress(YEAR)
        await obligationsPage.expectLoadedForYear(YEAR)
      })

      await test.step('check the paper/board tonnage accepted has gone up by the PRN', async () => {
        const accepted = await obligationsPage.readAcceptedTonnages()
        const tonnageAfter = parseTonnage(accepted[ACCEPT_OBLIGATION_ROW])

        logJourney(
          test.info(),
          `${ACCEPT_OBLIGATION_ROW}: ${tonnageAfter} tonnes accepted after accepting ${prn.number}`
        )
        expect(tonnageAfter).toBe(tonnageBefore + prn.tonnage)
      })
    })
  })
}
