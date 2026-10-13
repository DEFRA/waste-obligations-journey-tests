import { test, expect } from '../fixtures/pages.fixture.js'
import { skipUnlessPrnsConfigured } from '../utils/environment-features.js'
import { openAuthenticatedCsoPrnsList } from '../utils/prns-list-navigation.js'
import {
  PAPER_GROUP_HEADING,
  expectedCheckSelectionGroups,
  findPaperAndFibreRows
} from '../utils/check-selection.js'
import { getOrgId } from '../utils/waste-obligations-api.js'
import { logJourney } from '../utils/journey-log.js'

const YEAR = 2026

const CHECK_SELECTION_REDIRECT_MESSAGE =
  'Accept selected should redirect to the check-selection page. A frontend without it (before MO-470) re-renders the PRNs list instead; check the journey targets a frontend build that includes it.'

// storageState comes from cso-auth.setup.js (playwright/.auth/cso.json).
test.use({ storageState: 'playwright/.auth/cso.json' })

// The CSO twin checks the CSO routing, tables and Go back, and that a paper
// and a fibre PRN share one table; the DP journey covers removal. Only the
// session selection changes: nothing is accepted.
const requireRowData = process.env.ENVIRONMENT === 'local'

// Returns true when `sufficient`. Otherwise fails locally, or records a
// warning annotation on a deployed run and returns false.
function sufficientOrWarn(sufficient, description) {
  if (sufficient) {
    return true
  }

  const warning = `Too few selectable PRNs to verify ${description}.`

  if (requireRowData) {
    throw new Error(
      `${warning} The local fixture must seed enough multi-selectable CSO PRNs to verify this.`
    )
  }

  logJourney(test.info(), `WARNING: ${warning}`)
  test.info().annotations.push({ type: 'warning', description: warning })
  return false
}

function listPath() {
  return `/cso/${getOrgId('cso')}/prns`
}

test.describe('Compliance scheme PRNs check selection (CSO)', () => {
  /* eslint-disable playwright/no-conditional-in-test, playwright/no-conditional-expect */
  test('review a selection and go back', async ({
    page,
    prnsListPage,
    prnsCheckSelectionPage
  }) => {
    skipUnlessPrnsConfigured()

    await openAuthenticatedCsoPrnsList({ page, prnsListPage }, YEAR)

    const selected = await prnsListPage.readSelectableRows()

    if (!sufficientOrWarn(selected.length > 0, 'the check-selection page')) {
      return
    }

    const expectedGroups = expectedCheckSelectionGroups(selected)

    await test.step(`select ${selected.length} PRN(s) and choose Accept selected PRNs and PERNs`, async () => {
      for (const row of selected) {
        await prnsListPage.selectPrn(row.number)
      }
      await prnsListPage.clickAcceptSelected()
    })

    await test.step('check the CSO check-selection page loads', async () => {
      await expect(page, CHECK_SELECTION_REDIRECT_MESSAGE).toHaveURL(
        (url) =>
          url.pathname.endsWith(`${listPath()}/check-selection`) &&
          url.searchParams.get('year') === String(YEAR)
      )
      await prnsCheckSelectionPage.expectLoaded()
    })

    await test.step('check the PRNs are grouped by material with a total per table', async () => {
      const tables = await prnsCheckSelectionPage.readMaterialTables()

      expect(tables.map((table) => table.heading)).toEqual(
        expectedGroups.map((group) => group.heading)
      )
      for (const [index, group] of expectedGroups.entries()) {
        expect(tables[index].rows.map((row) => row.number).sort()).toEqual(
          [...group.numbers].sort()
        )
        expect(Number(tables[index].total.replaceAll(',', ''))).toBe(
          group.total
        )
      }
      await expect(prnsCheckSelectionPage.acceptButton).toBeDisabled()
    })

    await test.step('go back to the list with nothing selected', async () => {
      await prnsCheckSelectionPage.clickGoBack()

      await expect(page).toHaveURL(
        (url) =>
          url.pathname.endsWith(listPath()) &&
          url.searchParams.get('year') === String(YEAR)
      )
      await prnsListPage.expectLoaded()
      await prnsListPage.expectNoPrnSelected()
    })

    const { paper, fibre } = findPaperAndFibreRows(
      await prnsListPage.readSelectableRows()
    )

    if (
      sufficientOrWarn(
        Boolean(paper && fibre),
        'paper and fibre PRNs sharing one table'
      )
    ) {
      await test.step(`select paper PRN ${paper.number} and fibre PRN ${fibre.number}`, async () => {
        await prnsListPage.selectPrn(paper.number)
        await prnsListPage.selectPrn(fibre.number)
        await prnsListPage.clickAcceptSelected()

        await expect(page, CHECK_SELECTION_REDIRECT_MESSAGE).toHaveURL((url) =>
          url.pathname.endsWith(`${listPath()}/check-selection`)
        )
        await prnsCheckSelectionPage.expectLoaded()
      })

      await test.step('check the paper and fibre PRNs share one paper table', async () => {
        const tables = await prnsCheckSelectionPage.readMaterialTables()

        expect(tables.map((table) => table.heading)).toEqual([
          PAPER_GROUP_HEADING
        ])
        expect(tables[0].rows.map((row) => row.number).sort()).toEqual(
          [paper.number, fibre.number].sort()
        )
        expect(Number(tables[0].total.replaceAll(',', ''))).toBe(
          paper.tonnageValue + fibre.tonnageValue
        )
      })

      await test.step('go back to the list from the paper and fibre selection', async () => {
        await prnsCheckSelectionPage.clickGoBack()

        await expect(page).toHaveURL((url) => url.pathname.endsWith(listPath()))
        await prnsListPage.expectLoaded()
        await prnsListPage.expectNoPrnSelected()
      })
    }
  })
  /* eslint-enable playwright/no-conditional-in-test, playwright/no-conditional-expect */
})
