import { expect, test } from '../fixtures/pages.fixture.js'
import { skipUnlessPrnsConfigured } from '../utils/environment-features.js'
import { openAuthenticatedCsoPrnsList } from '../utils/prns-list-navigation.js'
import { getOrgId, listAwaitingPrns } from '../utils/waste-obligations-api.js'
import { getComplianceYear } from '../utils/journey-clock.js'
import { findStandardSelectablePrnsByMaterial } from '../utils/prn-selection.js'
import { logJourney } from '../utils/journey-log.js'
import { resetAwaitingPrns, seedAwaitingPrns } from '../utils/awaiting-prns.js'
import { PAPER_GROUP_HEADING } from '../utils/check-selection.js'
import {
  OBLIGATION_MATERIAL_LABELS,
  expectedAcceptedTiles,
  parseTonnage
} from '../utils/bulk-accept.js'
import {
  getCsoObligationsPath,
  usesPackagingEntryPoint
} from '../utils/journey-entry-point.js'

// Standard PRNs can only be multi-selected in the current compliance year.
const YEAR = getComplianceYear()

// storageState comes from cso-auth.setup.js (playwright/.auth/cso.json).
test.use({ storageState: 'playwright/.auth/cso.json' })

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

// Troubleshooting: if these tests fail locally with "GET organisation PRNs
// (status=AwaitingAcceptance) failed: 500", the API could not get an OAuth
// token from the local WireMock. The usual cause is that a run of
// waste-obligations' Api.IntegrationTests reset the WireMock mappings on
// localhost:9090. Restart the stack's WireMock to reload its static mappings:
//   docker restart epr-local-environment-wiremock-1
// Local stack only: seed the awaiting PRNs before each test and remove them after.
test.beforeEach(() => {
  seedAwaitingPrns('cso')
})

test.afterEach(async ({ request }) => {
  await resetAwaitingPrns('cso', request)
})

test.describe('Compliance scheme PRNs check selection go back (CSO)', () => {
  // Nothing here accepts or rejects a PRN.
  test('review a selection, remove one PRN, go back and find nothing selected', async ({
    page,
    request,
    prnsListPage,
    PrnsMultipleSelectionConfirmationPage
  }) => {
    skipUnlessPrnsConfigured()

    const prns =
      await test.step('find a PRN awaiting acceptance for each material', async () =>
        findStandardSelectablePrnsByMaterial(
          await listAwaitingPrns(request, getOrgId('cso')),
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

    await openAuthenticatedCsoPrnsList({ page, prnsListPage }, YEAR)

    await test.step('select a paper/board, a fibre and a glass other PRN', async () => {
      for (const prn of selected) {
        logJourney(test.info(), `Select ${prn.number} (${prn.material})`)
        await prnsListPage.selectPrn(prn.number)
      }
    })

    await test.step('submit the selection for review', async () => {
      await prnsListPage.clickAcceptSelected()
      await PrnsMultipleSelectionConfirmationPage.expectLoaded()
    })

    await test.step('remove the glass other PRN and check it is no longer listed', async () => {
      await PrnsMultipleSelectionConfirmationPage.removePrn(removed.number)

      await expect(
        page.getByRole('link', { name: removed.number, exact: true })
      ).toHaveCount(0)
    })

    await test.step('check paper/board and fibre share one table with their total', async () => {
      const paperAndFibre = [prns.Paper, prns.Fibre]
      const tables =
        await PrnsMultipleSelectionConfirmationPage.readMaterialTables()

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
      await PrnsMultipleSelectionConfirmationPage.clickGoBack()
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

test.describe('Compliance scheme accepts a PRN and sees it on manage obligations (CSO) @accept', () => {
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
    PrnsMultipleSelectionConfirmationPage,
    PrnsMultipleSelectionSuccessPage
  }) => {
    skipUnlessPrnsConfigured()

    const prn =
      await test.step(`find a standard ${YEAR} PRN awaiting acceptance for ${ACCEPT_MATERIAL}`, async () => {
        const found = findStandardSelectablePrnsByMaterial(
          await listAwaitingPrns(request, getOrgId('cso')),
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
      await page.goto(getCsoObligationsPath(YEAR), { timeout: 60_000 })
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
      await openAuthenticatedCsoPrnsList({ page, prnsListPage }, YEAR)
      await prnsListPage.selectPrn(prn.number)
      await prnsListPage.clickAcceptSelected()
      await PrnsMultipleSelectionConfirmationPage.expectLoaded()
      await PrnsMultipleSelectionConfirmationPage.clickAccept()
    })

    await test.step('check the confirmation shows the accepted PRN and its tonnage', async () => {
      await PrnsMultipleSelectionSuccessPage.expectLoaded(1, YEAR)

      const tiles = await PrnsMultipleSelectionSuccessPage.readTiles()
      expect(tiles).toHaveLength(1)
      expect(tiles).toEqual(
        expectedAcceptedTiles([prn]).map(({ tonnageText, description }) => ({
          tonnageText,
          description
        }))
      )
    })

    await test.step(`go back to manage obligations for ${YEAR} from the confirmation`, async () => {
      await PrnsMultipleSelectionSuccessPage.openObligationsProgress(YEAR)
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
