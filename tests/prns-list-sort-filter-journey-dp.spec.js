import { test, expect } from '../fixtures/pages.fixture.js'
import { skipUnlessPrnsConfigured } from '../utils/environment-features.js'
import { openAuthenticatedProducerPrnsList } from '../utils/prns-list-navigation.js'
import { logJourney } from '../utils/journey-log.js'

const YEAR = 2026

// The list's sort when no `sort` param is present in the URL.
const DEFAULT_SORT = 'IssuedAtDescending'

const FILTER_MAP = {
  Aluminium: 'Aluminium',
  Glass: 'Glass other',
  GlassRemelt: 'Glass re-melt',
  Paper: 'Paper, board or fibre-based composite material',
  Plastic: 'Plastic',
  Steel: 'Steel',
  Wood: 'Wood'
}

// Row materials each filter matches, where that's more than the filter value
// itself: the Paper filter covers fibre-based composite PRNs too.
const FILTER_ROW_MATERIALS = {
  Paper: ['Paper', 'Fibre']
}

const SORT_MAP = {
  IssuedAtDescending: 'Date issued (newest first)',
  IssuedAtAscending: 'Date issued (oldest first)',
  MaterialAscending: 'Material (A to Z)',
  MaterialDescending: 'Material (Z to A)',
  TonnageDescending: 'Tonnage: (heaviest first)',
  TonnageAscending: 'Tonnage: (lightest first)'
}

// Field on a row (from readPrnRows()) that each sort orders by, and the
// direction it orders in.
const SORT_FIELD = {
  IssuedAtDescending: { key: 'issuedAtTime', direction: 'desc' },
  IssuedAtAscending: { key: 'issuedAtTime', direction: 'asc' },
  MaterialAscending: { key: 'material', direction: 'asc' },
  MaterialDescending: { key: 'material', direction: 'desc' },
  TonnageDescending: { key: 'tonnageValue', direction: 'desc' },
  TonnageAscending: { key: 'tonnageValue', direction: 'asc' }
}

// ENVIRONMENT identifies the target, independently of the browser entry
// point. The shared Docker action sets local, which seeds several PRNs with
// distinct materials, dates and tonnages; deployed targets cannot guarantee
// that data, so an unverifiable check there is a warning, not a failure.
const requireRowData = process.env.ENVIRONMENT === 'local'

function hasDistinctValues(values) {
  return new Set(values).size > 1
}

function expectedOrder(values, direction) {
  const compare =
    typeof values[0] === 'string'
      ? (a, b) => a.localeCompare(b)
      : (a, b) => a - b
  const sorted = [...values].sort(compare)
  return direction === 'asc' ? sorted : sorted.reverse()
}

// Runs `verify` when there's enough row data to make the check meaningful.
// Otherwise: fails locally (the fixture guarantees enough data), or records
// a warning annotation on a deployed run where seeded data isn't guaranteed.
function verifyOrWarn(description, { sufficient, verify }) {
  if (sufficient) {
    verify()
    return
  }

  const warning = `Too few rows to verify ${description}.`

  if (requireRowData) {
    throw new Error(
      `${warning} The local fixture must seed enough distinct PRNs to verify this.`
    )
  }

  logJourney(test.info(), `WARNING: ${warning}`)
  test.info().annotations.push({ type: 'warning', description: warning })
}

test.describe('Producer PRNs list sort and filter controls (DP)', () => {
  test('sort and filter the PRNs list', async ({ page, prnsListPage }) => {
    skipUnlessPrnsConfigured()

    await openAuthenticatedProducerPrnsList({ page, prnsListPage }, YEAR)

    let baselineRows
    let baselineNumbers
    let baselineComplete

    await test.step('defaults to newest first and all materials', async () => {
      await expect(prnsListPage.sortSelect).toHaveValue(DEFAULT_SORT)
      await expect(prnsListPage.materialSelect).toHaveValue('')
      baselineRows = await prnsListPage.readPrnRows()
      baselineNumbers = baselineRows.map((row) => row.number)
      // Filtered results can only be checked against the baseline when it
      // holds every PRN, not just the first page.
      const summary = await prnsListPage.readResultsSummary()
      baselineComplete =
        summary === null
          ? baselineRows.length === 0
          : summary.total === baselineRows.length
    })

    for (const [sortValue, label] of Object.entries(SORT_MAP)) {
      await test.step(`sorting by ${sortValue} sorts the list by ${label}`, async () => {
        await prnsListPage.selectSort(label)
        await expect(prnsListPage.sortSelect).toHaveValue(sortValue)
        // Selecting the already-selected default fires no change event, so
        // the page doesn't reload and the URL keeps no `sort` param.
        const urlSort =
          new URL(page.url()).searchParams.get('sort') ?? DEFAULT_SORT
        expect(urlSort).toBe(sortValue)

        const { key, direction } = SORT_FIELD[sortValue]
        const values = (await prnsListPage.readPrnRows()).map((row) => row[key])

        verifyOrWarn(`the ${sortValue} row order`, {
          sufficient: hasDistinctValues(values),
          verify: () => expect(values).toEqual(expectedOrder(values, direction))
        })
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
      })
    }

    for (const [material, label] of Object.entries(FILTER_MAP)) {
      await test.step(`filtering by ${material} narrows the list to that material`, async () => {
        await prnsListPage.selectMaterial(label)
        await expect(prnsListPage.materialSelect).toHaveValue(material)
        expect(new URL(page.url()).searchParams.get('material')).toBe(material)

        const rows = await prnsListPage.readPrnRows()
        const allowed = FILTER_ROW_MATERIALS[material] ?? [material]

        expect(
          rows
            .map((row) => row.material)
            .filter((value) => !allowed.includes(value))
        ).toEqual([])

        // Rejecting wrong materials alone passes on an empty list, so also
        // require exactly the baseline's matching PRNs. An expected empty
        // result (e.g. Wood in the CI fixture) is checked the same way.
        verifyOrWarn(`filtered membership for ${material}`, {
          sufficient: baselineComplete,
          verify: () => {
            const expected = baselineRows
              .filter((row) => allowed.includes(row.material))
              .map((row) => row.number)
            expect(rows.map((row) => row.number).sort()).toEqual(
              expected.sort()
            )
          }
        })
      })

      await test.step(`setting material=${material} url value updates filter list value`, async () => {
        const url = new URL(page.url())
        url.searchParams.set('material', material)
        await page.goto(url.toString())

        await expect(prnsListPage.materialSelect).toHaveValue(material)
        await expect(
          prnsListPage.materialSelect.locator('option:checked')
        ).toHaveText(label)
      })
    }

    await test.step('clear all resets sort and material filter, restoring the original list', async () => {
      await prnsListPage.clickClearAll()

      await expect(
        prnsListPage.sortSelect.locator('option:checked')
      ).toHaveText('Date issued (newest first)')
      await expect(prnsListPage.materialSelect).toHaveValue('')
      const url = new URL(page.url())
      expect(url.searchParams.get('sort')).toBeNull()
      expect(url.searchParams.get('material')).toBeNull()

      const numbers = (await prnsListPage.readPrnRows()).map(
        (row) => row.number
      )

      verifyOrWarn('clear-all restoring the original row set', {
        sufficient: baselineNumbers.length > 0,
        verify: () => expect(numbers).toEqual(baselineNumbers)
      })
    })
  })

  // Changing either select auto-submits a full-page GET. A keyboard user
  // must keep their place across that reload rather than having focus reset
  // to the top of the new document.
  test('keyboard users can select a sort option and retain focus', async ({
    page,
    prnsListPage
  }) => {
    skipUnlessPrnsConfigured()

    await openAuthenticatedProducerPrnsList({ page, prnsListPage }, YEAR)

    await prnsListPage.sortSelect.focus()
    await prnsListPage.selectSort('Tonnage: (heaviest first)')

    await expect(prnsListPage.sortSelect).toHaveValue('TonnageDescending')
    expect(new URL(page.url()).searchParams.get('sort')).toBe(
      'TonnageDescending'
    )
    await expect(prnsListPage.sortSelect).toBeFocused()
  })

  test('keyboard users can select a material filter and retain focus', async ({
    page,
    prnsListPage
  }) => {
    skipUnlessPrnsConfigured()

    await openAuthenticatedProducerPrnsList({ page, prnsListPage }, YEAR)

    await prnsListPage.materialSelect.focus()
    await prnsListPage.selectMaterial('Aluminium')

    await expect(prnsListPage.materialSelect).toHaveValue('Aluminium')
    expect(new URL(page.url()).searchParams.get('material')).toBe('Aluminium')
    await expect(prnsListPage.materialSelect).toBeFocused()
  })

  // Changing a select disables the other one for the duration of the reload
  // it triggers, so a user can't act on stale controls mid-navigation.
  //
  // The disabled state only exists on the document that's about to be
  // replaced, so it can't be checked after the fact: `expect(locator).
  // toBeDisabled()` waits for any in-flight navigation to finish before
  // checking (confirmed directly - it reports "enabled" once the reload has
  // already landed), and even racing a deliberately delayed response against
  // a plain `.isDisabled()` read is unreliable, because the browser can start
  // discarding the old document before a delayed response arrives. Instead,
  // capture the state synchronously inside the same change-event dispatch as
  // the app's own handler (which runs first, since it was registered first,
  // on page load) and persist it across the reload via sessionStorage - the
  // same mechanism the app itself uses for focus restoration - then read it
  // back once the new page has loaded.
  test('disables the material filter while a sort change reloads the page, then re-enables it', async ({
    page,
    prnsListPage
  }) => {
    skipUnlessPrnsConfigured()

    await openAuthenticatedProducerPrnsList({ page, prnsListPage }, YEAR)

    await page.evaluate(() => {
      document.getElementById('sort').addEventListener('change', () => {
        sessionStorage.setItem(
          'test:materialDisabledOnSortChange',
          String(document.getElementById('filter').disabled)
        )
      })
    })

    await prnsListPage.sortSelect.selectOption({
      label: 'Tonnage: (heaviest first)'
    })

    await page.waitForURL(
      (url) => url.searchParams.get('sort') === 'TonnageDescending'
    )
    await prnsListPage.expectLoaded()

    const capturedDisabled = await page.evaluate(() =>
      sessionStorage.getItem('test:materialDisabledOnSortChange')
    )
    expect(capturedDisabled).toBe('true')
    await expect(prnsListPage.materialSelect).toBeEnabled()
  })

  test('disables the sort control while a material filter change reloads the page, then re-enables it', async ({
    page,
    prnsListPage
  }) => {
    skipUnlessPrnsConfigured()

    await openAuthenticatedProducerPrnsList({ page, prnsListPage }, YEAR)

    await page.evaluate(() => {
      document.getElementById('filter').addEventListener('change', () => {
        sessionStorage.setItem(
          'test:sortDisabledOnMaterialChange',
          String(document.getElementById('sort').disabled)
        )
      })
    })

    await prnsListPage.materialSelect.selectOption({ label: 'Aluminium' })

    await page.waitForURL(
      (url) => url.searchParams.get('material') === 'Aluminium'
    )
    await prnsListPage.expectLoaded()

    const capturedDisabled = await page.evaluate(() =>
      sessionStorage.getItem('test:sortDisabledOnMaterialChange')
    )
    expect(capturedDisabled).toBe('true')
    await expect(prnsListPage.sortSelect).toBeEnabled()
  })
})
