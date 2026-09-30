import { test, expect } from '../fixtures/pages.fixture.js'
import { skipUnlessPrnsConfigured } from '../utils/environment-features.js'
import { logJourney } from '../utils/journey-log.js'
import {
  openAuthenticatedProducerPrnsList,
  openProducerPrnsList
} from '../utils/prns-list-navigation.js'

const YEAR = 2026

const REQUIRE_VERIFIABLE_DATA = process.env.ENVIRONMENT === 'local'

const FILTER_MAP = {
  Aluminium: 'Aluminium',
  Glass: 'Glass other',
  GlassRemelt: 'Glass re-melt',
  Paper: 'Paper, board or fibre-based composite material',
  Plastic: 'Plastic',
  Steel: 'Steel',
  Wood: 'Wood'
}

// Material names rendered in the list for each filter. The Waste Obligations
// API maps the common backend's names (for example "Glass Other") to these
// keys, and the paper filter also matches Fibre.
const FILTER_MATERIALS = {
  Aluminium: ['Aluminium'],
  Glass: ['Glass'],
  GlassRemelt: ['GlassRemelt'],
  Paper: ['Paper', 'Fibre'],
  Plastic: ['Plastic'],
  Steel: ['Steel'],
  Wood: ['Wood']
}

const SORT_MAP = {
  IssuedAtDescending: 'Date issued (newest first)',
  IssuedAtAscending: 'Date issued (oldest first)',
  MaterialAscending: 'Material (A to Z)',
  MaterialDescending: 'Material (Z to A)',
  TonnageDescending: 'Tonnage: (heaviest first)',
  TonnageAscending: 'Tonnage: (lightest first)'
}

const DEFAULT_SORT = 'IssuedAtDescending'

const compareMaterial = (a, b) =>
  a.material.localeCompare(b.material, 'en', { sensitivity: 'base' })
const SORT_ORDER = {
  IssuedAtDescending: {
    field: 'issuedAt',
    compare: (a, b) => b.issuedAtTime - a.issuedAtTime
  },
  IssuedAtAscending: {
    field: 'issuedAt',
    compare: (a, b) => a.issuedAtTime - b.issuedAtTime
  },
  MaterialAscending: { field: 'material', compare: compareMaterial },
  MaterialDescending: {
    field: 'material',
    compare: (a, b) => compareMaterial(b, a)
  },
  TonnageDescending: {
    field: 'tonnage',
    compare: (a, b) => b.tonnageValue - a.tonnageValue
  },
  TonnageAscending: {
    field: 'tonnage',
    compare: (a, b) => a.tonnageValue - b.tonnageValue
  }
}

const describeRows = (rows) =>
  rows
    .map(
      (row) => `${row.number} ${row.material} ${row.issuedAt} ${row.tonnage}t`
    )
    .join('; ') || '(no rows)'

const sortedNumbers = (rows) => rows.map((row) => row.number).sort()

const matchesFilter = (row, material) =>
  FILTER_MATERIALS[material].some(
    (name) => name.toLowerCase() === row.material.toLowerCase()
  )

// Fails locally, where the fixture guarantees the data; otherwise records
// that the check could not be made and returns false.
function requireVerifiable(condition, message) {
  if (REQUIRE_VERIFIABLE_DATA) {
    expect(condition, message).toBe(true)
  }
  if (!condition) {
    const warning = `${message} This check was not verified.`
    logJourney(test.info(), `WARNING: ${warning}`)
    test.info().annotations.push({ type: 'warning', description: warning })
  }
  return condition
}

async function sortAndFilterPrnsList({ page, prnsListPage }) {
  let baseline
  let baselineComplete

  const expectSortedBy = (rows, sortValue, { report = true } = {}) => {
    const { field, compare } = SORT_ORDER[sortValue]
    const distinctValues = new Set(rows.map((row) => row[field])).size
    if (!report && distinctValues < 2) {
      return
    }
    if (
      requireVerifiable(
        distinctValues >= 2,
        `Too few PRNs to verify ${SORT_MAP[sortValue]} ordering: ${rows.length} row(s) with ${distinctValues} distinct ${field} value(s).`
      )
    ) {
      expect(
        rows.map((row) => row.number),
        `Rows are not ordered by ${SORT_MAP[sortValue]}: ${describeRows(rows)}`
      ).toEqual([...rows].sort(compare).map((row) => row.number))
    }
  }

  const expectSortedList = async (sortValue) => {
    const rows = await prnsListPage.readPrnRows()
    if (baselineComplete) {
      expect(
        sortedNumbers(rows),
        `Sorting by ${SORT_MAP[sortValue]} changed which PRNs are listed`
      ).toEqual(sortedNumbers(baseline))
    }
    expectSortedBy(rows, sortValue)
  }

  const expectFilteredList = async (material) => {
    const rows = await prnsListPage.readPrnRows()
    const unexpected = rows.filter((row) => !matchesFilter(row, material))
    expect(
      unexpected,
      `Filtering by ${FILTER_MAP[material]} listed other materials: ${describeRows(unexpected)}`
    ).toEqual([])
    if (baselineComplete) {
      expect(
        sortedNumbers(rows),
        `Filtering by ${FILTER_MAP[material]} did not list exactly the matching PRNs`
      ).toEqual(
        sortedNumbers(baseline.filter((row) => matchesFilter(row, material)))
      )
    }
    const sort = new URL(page.url()).searchParams.get('sort')
    expectSortedBy(rows, sort ?? DEFAULT_SORT, { report: false })
    return rows.length
  }

  await test.step('read the unfiltered list', async () => {
    baseline = await prnsListPage.readPrnRows()
    const summary = await prnsListPage.readResultsSummary()
    baselineComplete =
      summary === null
        ? baseline.length === 0
        : summary.from === 1 && summary.to === summary.total
    logJourney(
      test.info(),
      `PRN sort/filter data: ${baseline.length} row(s)${
        summary && !baselineComplete ? ` of ${summary.total}` : ''
      }; ${describeRows(baseline)}`
    )
    requireVerifiable(
      baselineComplete,
      'The PRNs list spans several pages, so filtered and sorted membership cannot be compared with the full list.'
    )
    requireVerifiable(
      baseline.length >= 3 &&
        new Set(baseline.map((row) => row.material)).size >= 2,
      `Too few PRNs to verify filtering: ${baseline.length} row(s) across ${
        new Set(baseline.map((row) => row.material)).size
      } material(s).`
    )
  })

  await test.step('defaults to newest first and all materials', async () => {
    await expect(prnsListPage.sortSelect).toHaveValue(DEFAULT_SORT)
    await expect(prnsListPage.materialSelect).toHaveValue('')
    expectSortedBy(baseline, DEFAULT_SORT)
  })

  for (const [sortValue, label] of Object.entries(SORT_MAP)) {
    await test.step(`sorting by ${sortValue} sorts the list by ${label}`, async () => {
      await prnsListPage.selectSort(label)
      await expect(prnsListPage.sortSelect).toHaveValue(sortValue)
      expect(new URL(page.url()).searchParams.get('sort')).toBe(sortValue)
      await expectSortedList(sortValue)
    })
    await test.step(`setting sort=${sortValue} url value updates sorted list by ${label}`, async () => {
      // Build from the current URL so the proxy prefix and year are kept.
      const url = new URL(page.url())
      url.searchParams.set('sort', sortValue)
      await page.goto(url.toString())

      await expect(prnsListPage.sortSelect).toHaveValue(sortValue)
      await expect(
        prnsListPage.sortSelect.locator('option:checked')
      ).toHaveText(label)
      await expectSortedList(sortValue)
    })
  }

  let filteredRowsSeen = 0
  for (const [material, label] of Object.entries(FILTER_MAP)) {
    await test.step(`filtering by ${material} narrows the list to that material`, async () => {
      await prnsListPage.selectMaterial(label)
      await expect(prnsListPage.materialSelect).toHaveValue(material)
      expect(new URL(page.url()).searchParams.get('material')).toBe(material)
      filteredRowsSeen += await expectFilteredList(material)
    })

    await test.step(`setting material=${material} url value updates filter list value`, async () => {
      const url = new URL(page.url())
      url.searchParams.set('material', material)
      await page.goto(url.toString())

      await expect(prnsListPage.materialSelect).toHaveValue(material)
      await expect(
        prnsListPage.materialSelect.locator('option:checked')
      ).toHaveText(label)
      await expectFilteredList(material)
    })
  }

  requireVerifiable(
    filteredRowsSeen > 0,
    'No material filter returned any PRNs, so filtered membership was only checked for empty results.'
  )

  await test.step('clear all resets sort and material filter', async () => {
    await prnsListPage.clickClearAll()

    await expect(prnsListPage.sortSelect.locator('option:checked')).toHaveText(
      SORT_MAP[DEFAULT_SORT]
    )
    await expect(prnsListPage.materialSelect).toHaveValue('')
    const url = new URL(page.url())
    expect(url.searchParams.get('sort')).toBeNull()
    expect(url.searchParams.get('material')).toBeNull()

    const rows = await prnsListPage.readPrnRows()
    expect(
      rows.map((row) => row.number),
      `Clear all did not restore the unfiltered list: ${describeRows(rows)}`
    ).toEqual(baseline.map((row) => row.number))
  })
}

test.describe('Producer PRNs list sort and filter controls (DP)', () => {
  // Starts signed out to exercise the explicit B2C sign-in to the PRNs list.
  test.use({ storageState: { cookies: [], origins: [] } })

  test('sort and filter the PRNs list', async ({ page, prnsListPage }) => {
    skipUnlessPrnsConfigured()

    await openProducerPrnsList({ page, prnsListPage }, YEAR)
    await sortAndFilterPrnsList({ page, prnsListPage })
  })
})

test.describe('Producer PRNs list sort and filter controls (DP, authenticated)', () => {
  // Reuses the session saved by auth.setup.js, so this variant never signs in.
  test.use({ storageState: 'playwright/.auth/dp.json' })

  test('sort and filter the PRNs list with the saved session', async ({
    page,
    prnsListPage
  }) => {
    skipUnlessPrnsConfigured()

    await openAuthenticatedProducerPrnsList({ page, prnsListPage }, YEAR)
    await sortAndFilterPrnsList({ page, prnsListPage })
  })
})
