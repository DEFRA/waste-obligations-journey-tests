import { test, expect } from '../fixtures/pages.fixture.js'
import { skipUnlessPrnsConfigured } from '../utils/environment-features.js'
import { openAuthenticatedCsoPrnsList } from '../utils/prns-list-navigation.js'
import { expectedCheckSelectionGroups } from '../utils/check-selection.js'
import { getOrgId } from '../utils/waste-obligations-api.js'
import { logJourney } from '../utils/journey-log.js'

const YEAR = 2026

// storageState comes from cso-auth.setup.js (playwright/.auth/cso.json).
test.use({ storageState: 'playwright/.auth/cso.json' })

// The local fixture seeds one multi-selectable CSO PRN, so this twin checks
// the CSO routing, table and Go back; the DP journey covers removal across
// several PRNs. Only the session selection changes: nothing is accepted.
const requireRowData = process.env.ENVIRONMENT === 'local'

function listPath() {
  return `/cso/${getOrgId('cso')}/prns`
}

test.describe('Compliance scheme PRNs check selection (CSO)', () => {
  /* eslint-disable playwright/no-conditional-in-test */
  test('review a selection and go back', async ({
    page,
    prnsListPage,
    prnsCheckSelectionPage
  }) => {
    skipUnlessPrnsConfigured()

    await openAuthenticatedCsoPrnsList({ page, prnsListPage }, YEAR)

    const selected = await prnsListPage.readSelectableRows()

    if (selected.length === 0) {
      const warning = 'No selectable PRNs to verify the check-selection page.'
      if (requireRowData) {
        throw new Error(
          `${warning} The local fixture must seed a multi-selectable CSO PRN.`
        )
      }
      logJourney(test.info(), `WARNING: ${warning}`)
      test.info().annotations.push({ type: 'warning', description: warning })
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
      await expect(page).toHaveURL(
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
  })
  /* eslint-enable playwright/no-conditional-in-test */
})
