import { expect, test } from '../fixtures/pages.fixture.js'
import { skipUnlessPrnsConfigured } from './environment-features.js'
import {
  getOrgId,
  listAcceptedPrns,
  listAwaitingPrns
} from './waste-obligations-api.js'
import { getComplianceYear } from './journey-clock.js'
import { findStandardSelectablePrnsByMaterial } from './prn-selection.js'
import { logJourney } from './journey-log.js'
import { reportSkippedSteps } from './skipped-steps.js'
import { resetAwaitingPrns, seedAwaitingPrns } from './awaiting-prns.js'
import { PAPER_GROUP_HEADING } from './check-selection.js'
import { usesPackagingEntryPoint } from './journey-entry-point.js'
import {
  expectedAcceptedTiles,
  expectedObligationChanges,
  parseTonnage
} from './bulk-accept.js'
import { ACCEPT_JOURNEY_PRN_NUMBERS } from '../data/prns.data.js'
import {
  analyseAccessibility,
  assertNoAccessibilityIssues,
  generateAccessibilityReports,
  initialiseAccessibilityChecking
} from '../tests/accessibility-checking.js'

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

// The Azure Packaging search page the confirmation links to while CDP has no
// search page of its own (agreed for MO-471 AC5 on 27 October 2026).
const PACKAGING_SEARCH_PATH = '/report-data/view-awaiting-acceptance'
const SEARCH_PAGE_HEADING = /^search prns and perns$/i

// Every PRN number on every page of the list.
async function readListedNumbers(prnsListPage) {
  const numbers = (await prnsListPage.readPrnRows()).map((row) => row.number)

  while (await prnsListPage.hasNextPage()) {
    await prnsListPage.goToNextPage()
    numbers.push(...(await prnsListPage.readPrnRows()).map((row) => row.number))
  }

  return numbers
}

async function readObligationsProgress(obligationsPage) {
  const accepted = await obligationsPage.readAcceptedTonnages()
  const awaiting = await obligationsPage.readAwaitingTonnages()

  return {
    accepted,
    awaiting,
    count: await obligationsPage.readAwaitingAcceptanceCount()
  }
}

/**
 * Defines the multi-select PRN journeys for one account: a go-back test that
 * accepts nothing, and an @accept test that accepts several PRNs and PERNs.
 * The DP and CSO spec files call this with their own login, list and
 * obligations routes.
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
    test('MO-470 — review a selection, remove one PRN, go back and find nothing selected', async ({
      page,
      request,
      prnsListPage,
      prnsCheckSelectionPage
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
        await prnsCheckSelectionPage.expectLoaded()
      })

      await test.step('remove the glass other PRN and check it is no longer listed', async () => {
        await prnsCheckSelectionPage.removePrn(removed.number)

        await expect(
          page.getByRole('link', { name: removed.number, exact: true })
        ).toHaveCount(0)
      })

      await test.step('check paper/board and fibre share one table with their total', async () => {
        const paperAndFibre = [prns.Paper, prns.Fibre]
        const tables = await prnsCheckSelectionPage.readMaterialTables()

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
        await prnsCheckSelectionPage.clickGoBack()
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

  test.describe(`${label} accepts several PRNs and PERNs and sees them on manage obligations (${tag}) @accept`, () => {
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

    test('MO-471 AC1–AC6 — accept a selection across materials, then check the confirmation, manage obligations and the list', async ({
      page,
      request,
      obligationsPage,
      prnsListPage,
      prnsCheckSelectionPage,
      prnsAcceptedSelectionPage
    }) => {
      skipUnlessPrnsConfigured()

      const orgId = getOrgId(account)
      const numbers = ACCEPT_JOURNEY_PRN_NUMBERS[account]

      const prns =
        await test.step(`find ${numbers.join(', ')} awaiting acceptance`, async () => {
          const awaiting = await listAwaitingPrns(request, orgId)
          expect(
            awaiting.map((prn) => prn.number),
            'The journey fixture must list every PRN this journey accepts.'
          ).toEqual(expect.arrayContaining(numbers))

          return numbers.map((number) =>
            awaiting.find((prn) => prn.number === number)
          )
        })
      const changes = expectedObligationChanges(prns)

      const before =
        await test.step(`read manage obligations for ${YEAR} before accepting`, async () => {
          await page.goto(obligationsPath(YEAR), { timeout: 60_000 })
          await obligationsPage.expectLoadedForYear(YEAR)

          const progress = await readObligationsProgress(obligationsPage)
          for (const row of Object.keys(changes)) {
            expect(
              progress.accepted[row],
              `The obligations table has no "${row}" row.`
            ).toBeDefined()
          }
          logJourney(
            test.info(),
            `Before: accepted ${JSON.stringify(progress.accepted)}; awaiting ${JSON.stringify(progress.awaiting)}; count ${progress.count}`
          )
          return progress
        })

      await test.step('select the PRNs and PERNs and review the selection', async () => {
        await openPrnsList({ page, prnsListPage }, YEAR)
        for (const prn of prns) {
          logJourney(test.info(), `Select ${prn.number} (${prn.material})`)
          await prnsListPage.selectPrn(prn.number)
        }
        await prnsListPage.clickAcceptSelected()
        await prnsCheckSelectionPage.expectLoaded()
      })

      await test.step('AC1 — Accept is at the base of the review page', async () => {
        await prnsCheckSelectionPage.expectAcceptBelowSelection()
      })

      await test.step('AC2, AC4 — accept and see the confirmation for the number accepted and the year', async () => {
        await prnsCheckSelectionPage.clickAccept()
        await prnsAcceptedSelectionPage.expectLoaded(numbers.length, YEAR)
      })

      await test.step('AC3, AC4 — one tile per material with its total tonnage', async () => {
        expect(await prnsAcceptedSelectionPage.readTiles()).toEqual(
          expectedAcceptedTiles(prns).map(({ tonnageText, description }) => ({
            tonnageText,
            description
          }))
        )
      })

      await test.step('scan the confirmation for accessibility issues', async () => {
        await initialiseAccessibilityChecking()
        await analyseAccessibility(page, `${account}-prns-accepted-selection`)
        generateAccessibilityReports(`${account}-prns-accepted-selection`)
        assertNoAccessibilityIssues()
      })

      const searchUrl =
        await test.step('AC5 — the search link opens the search page with no filters', async () => {
          const url = await prnsAcceptedSelectionPage.readSearchLinkUrl()
          logJourney(test.info(), `Search PRNs and PERNs: ${url.href}`)

          expect(url.pathname).toMatch(/\/view-awaiting-acceptance$/)
          expect(url.search).toBe('')
          return url
        })

      await test.step(`AC6 — the progress button opens manage obligations for ${YEAR}`, async () => {
        await prnsAcceptedSelectionPage.openObligationsProgress(YEAR)
        await obligationsPage.expectLoadedForYear(YEAR)
        await expect(page).toHaveURL(
          (url) => `${url.pathname}${url.search}` === obligationsPath(YEAR)
        )
      })

      await test.step('AC2 — the tonnage moved from awaiting to accepted, and the count dropped', async () => {
        const after = await readObligationsProgress(obligationsPage)
        logJourney(
          test.info(),
          `After: accepted ${JSON.stringify(after.accepted)}; awaiting ${JSON.stringify(after.awaiting)}; count ${after.count}`
        )

        for (const [row, tonnage] of Object.entries(changes)) {
          expect(parseTonnage(after.accepted[row]), `${row} accepted`).toBe(
            parseTonnage(before.accepted[row]) + tonnage
          )
          expect(parseTonnage(after.awaiting[row]), `${row} awaiting`).toBe(
            parseTonnage(before.awaiting[row]) - tonnage
          )
        }
        expect(after.count).toBe(before.count - numbers.length)
      })

      await test.step('AC2 — the accepted PRNs and PERNs have left the list', async () => {
        await openPrnsList({ page, prnsListPage }, YEAR)
        const listed = await readListedNumbers(prnsListPage)

        for (const number of numbers) {
          expect(listed, `${number} is still listed`).not.toContain(number)
        }
      })

      await test.step(`AC2 — each one reads back as accepted towards ${YEAR}`, async () => {
        const accepted = await listAcceptedPrns(request, orgId)
        const awaiting = await listAwaitingPrns(request, orgId)

        for (const number of numbers) {
          const prn = accepted.find((candidate) => candidate.number === number)
          expect(prn, `${number} is not accepted`).toBeDefined()
          expect(prn.obligationYear, `${number} obligation year`).toBe(YEAR)
          expect(
            awaiting.map((candidate) => candidate.number),
            `${number} is still awaiting acceptance`
          ).not.toContain(number)
        }
      })

      // The link goes to the Azure Packaging search page. The CI stack has no
      // Packaging app, so the frontend's Packaging URL points elsewhere there.
      /* eslint-disable playwright/no-conditional-in-test, playwright/no-conditional-expect -- entry-point routing: only a stack with the Packaging app can open its search page */
      if (searchUrl.pathname === PACKAGING_SEARCH_PATH) {
        await test.step('AC5 — follow the search link to the unfiltered Packaging search page', async () => {
          await page.goto(searchUrl.href, { timeout: 60_000 })
          await expect(
            page.getByRole('heading', { name: SEARCH_PAGE_HEADING })
          ).toBeVisible()
          expect(new URL(page.url()).search).toBe('')
        })
      } else {
        await reportSkippedSteps(
          'AC5 — follow the search link to the Packaging search page',
          `This stack has no Azure Packaging app: the link points at ${searchUrl.origin}${searchUrl.pathname}.`
        )
      }
      /* eslint-enable playwright/no-conditional-in-test, playwright/no-conditional-expect */
    })
  })
}
