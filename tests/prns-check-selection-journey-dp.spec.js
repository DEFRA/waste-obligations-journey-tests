import { test, expect } from '../fixtures/pages.fixture.js'
import { skipUnlessPrnsConfigured } from '../utils/environment-features.js'
import { openAuthenticatedProducerPrnsList } from '../utils/prns-list-navigation.js'
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

// A non-default sort chosen before selecting, so "Go back" can be checked to
// return to the same list view rather than a reset one.
const LIST_SORT = {
  value: 'TonnageDescending',
  label: 'Tonnage: (heaviest first)'
}

// ENVIRONMENT identifies the target, independently of the browser entry
// point. The shared Docker action sets local, whose fixture seeds several
// multi-selectable PRNs across materials (two Aluminium, two Plastic).
// Deployed targets cannot guarantee that data, so an unverifiable check there
// is a warning, not a failure. Only the session selection changes here:
// nothing is accepted or rejected.
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
      `${warning} The local fixture must seed enough multi-selectable PRNs to verify this.`
    )
  }

  logJourney(test.info(), `WARNING: ${warning}`)
  test.info().annotations.push({ type: 'warning', description: warning })
  return false
}

function checkSelectionPath() {
  return `/producer/${getOrgId('dp')}/prns/check-selection`
}

function listPath() {
  return `/producer/${getOrgId('dp')}/prns`
}

test.describe('Producer PRNs check selection (DP)', () => {
  /* eslint-disable playwright/no-conditional-in-test, playwright/no-conditional-expect */
  test('review, remove from and go back from a multi-PRN selection', async ({
    page,
    prnsListPage,
    prnsCheckSelectionPage,
    prnPage
  }) => {
    skipUnlessPrnsConfigured()

    await openAuthenticatedProducerPrnsList({ page, prnsListPage }, YEAR)

    // The PRN opened from its number link later on. The first row in the
    // list's default order is the one the PRNs list journey opens, and the
    // only producer PRN the CI fixture serves a detail page for.
    const [prnToOpen] = await prnsListPage.readSelectableRows()

    await test.step(`sort the list by ${LIST_SORT.label}`, async () => {
      await prnsListPage.selectSort(LIST_SORT.label)
      await expect(prnsListPage.sortSelect).toHaveValue(LIST_SORT.value)
    })

    const selected = await prnsListPage.readSelectableRows()

    if (!sufficientOrWarn(selected.length > 0, 'the check-selection page')) {
      return
    }

    let expectedGroups = expectedCheckSelectionGroups(selected)

    await test.step(`select ${selected.length} PRN(s) and choose Accept selected PRNs and PERNs`, async () => {
      for (const row of selected) {
        await prnsListPage.selectPrn(row.number)
      }
      await prnsListPage.clickAcceptSelected()
    })

    await test.step('check the check-selection page loads for the requested year', async () => {
      await expect(page, CHECK_SELECTION_REDIRECT_MESSAGE).toHaveURL(
        (url) =>
          url.pathname.endsWith(checkSelectionPath()) &&
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
        const table = tables[index]
        expect(table.rows.map((row) => row.number).sort()).toEqual(
          [...group.numbers].sort()
        )
        expect(table.totalLabel).toBe('Total')
        expect(Number(table.total.replaceAll(',', ''))).toBe(group.total)
      }
    })

    await test.step('check each PRN row repeats its list values', async () => {
      const rows = (await prnsCheckSelectionPage.readMaterialTables()).flatMap(
        (table) => table.rows
      )

      for (const listRow of selected) {
        const row = rows.find(
          (candidate) => candidate.number === listRow.number
        )
        expect(row, `${listRow.number} should be on the page`).toBeDefined()
        expect(row.issuedAt).toBe(listRow.issuedAt)
        expect(row.issuer).toBe(listRow.issuer)
        expect(Number(row.tonnage.replaceAll(',', ''))).toBe(
          listRow.tonnageValue
        )
      }
    })

    await test.step('check Accept is shown but disabled', async () => {
      await expect(prnsCheckSelectionPage.acceptButton).toBeVisible()
      await expect(prnsCheckSelectionPage.acceptButton).toBeDisabled()
    })

    await test.step('open a PRN from its number link, then return', async () => {
      const { number } = prnToOpen
      await prnsCheckSelectionPage.openPrn(number)
      // The PRN page is /prns/{prnId}; the PRN id isn't shown on screen.
      await expect(page).toHaveURL(
        (url) =>
          url.pathname.includes(`${listPath()}/`) &&
          !url.pathname.endsWith(checkSelectionPath()) &&
          url.searchParams.get('year') === String(YEAR)
      )
      await prnPage.expectLoadedForNumber(number)

      await page.goBack()
      await prnsCheckSelectionPage.expectLoaded()
    })

    if (
      sufficientOrWarn(selected.length > 1, 'removing a PRN from the selection')
    ) {
      await test.step('remove a PRN from the selection', async () => {
        // Prefer a material with more than one PRN, so its table stays and
        // the total can be checked to drop by the removed tonnage.
        const group =
          expectedGroups.find((candidate) => candidate.numbers.length > 1) ??
          expectedGroups[0]
        const removed = selected.find((row) => row.number === group.numbers[0])

        await prnsCheckSelectionPage.removePrn(removed.number)

        const remaining = selected.filter(
          (row) => row.number !== removed.number
        )
        expectedGroups = expectedCheckSelectionGroups(remaining)
        const tables = await prnsCheckSelectionPage.readMaterialTables()

        expect(tables.map((table) => table.heading)).toEqual(
          expectedGroups.map((candidate) => candidate.heading)
        )
        expect(
          tables.flatMap((table) => table.rows.map((row) => row.number))
        ).not.toContain(removed.number)

        const updated = expectedGroups.find(
          (candidate) => candidate.heading === group.heading
        )
        if (updated) {
          await expect(
            prnsCheckSelectionPage
              .table(group.heading)
              .getByTestId('material-total-tonnage')
          ).toHaveText(String(updated.total))
        } else {
          await expect(prnsCheckSelectionPage.table(group.heading)).toHaveCount(
            0
          )
        }
      })
    }

    await test.step('go back to the same list view with nothing selected', async () => {
      await prnsCheckSelectionPage.clickGoBack()

      await expect(page).toHaveURL(
        (url) =>
          url.pathname.endsWith(listPath()) &&
          url.searchParams.get('year') === String(YEAR) &&
          url.searchParams.get('sort') === LIST_SORT.value
      )
      await prnsListPage.expectLoaded()
      await expect(prnsListPage.sortSelect).toHaveValue(LIST_SORT.value)
      await prnsListPage.expectNoPrnSelected()
    })

    await test.step('check the cleared selection no longer opens the check-selection page', async () => {
      const url = new URL(page.url())
      url.pathname = url.pathname.replace(/\/prns$/, '/prns/check-selection')
      url.search = new URLSearchParams({ year: String(YEAR) }).toString()
      await page.goto(url.toString())

      await expect(page).toHaveURL((current) =>
        current.pathname.endsWith(listPath())
      )
      await prnsListPage.expectLoaded()
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
          url.pathname.endsWith(checkSelectionPath())
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
