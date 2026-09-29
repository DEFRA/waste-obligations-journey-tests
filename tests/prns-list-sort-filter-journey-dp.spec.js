import { test, expect } from '../fixtures/pages.fixture.js'
import { skipUnlessPrnsConfigured } from '../utils/environment-features.js'
import { openProducerPrnsList } from '../utils/prns-list-navigation.js'

const YEAR = 2026

const FILTER_MAP = {
  Aluminium: 'Aluminium',
  Glass: 'Glass other',
  GlassRemelt: 'Glass re-melt',
  Paper: 'Paper, board or fibre-based composite material',
  Plastic: 'Plastic',
  Steel: 'Steel',
  Wood: 'Wood'
}

const SORT_MAP = {
  IssuedAtDescending: 'Date issued (newest first)',
  IssuedAtAscending: 'Date issued (oldest first)',
  MaterialAscending: 'Material (A to Z)',
  MaterialDescending: 'Material (Z to A)',
  TonnageDescending: 'Tonnage: (heaviest first)',
  TonnageAscending: 'Tonnage: (lightest first)'
}

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Producer PRNs list sort and filter controls (DP)', () => {
  test('sort and filter the PRNs list', async ({
    page,
    request,
    prnsListPage
  }) => {
    skipUnlessPrnsConfigured()

    await openProducerPrnsList({ page, prnsListPage }, YEAR)

    await test.step('defaults to newest first and all materials', async () => {
      await expect(prnsListPage.sortSelect).toHaveValue('IssuedAtDescending')
      await expect(prnsListPage.materialSelect).toHaveValue('')
    })

    await test.step('sorting by material updates the selection, URL and list order', async () => {
      await prnsListPage.selectSort('Material (A to Z)')
      await expect(prnsListPage.sortSelect).toHaveValue('MaterialAscending')

      expect(new URL(page.url()).searchParams.get('sort')).toBe(
        'MaterialAscending'
      )

      const materials = await prnsListPage.readRowMaterials()
      const sorted = [...materials].sort((a, b) => a.localeCompare(b))
      expect(materials).toEqual(sorted)
    })

    for (const [sortValue, label] of Object.entries(SORT_MAP)) {
      await test.step(`sorting by ${sortValue} sorts the list by ${label}`, async () => {
        await prnsListPage.selectSort(label)
        await expect(prnsListPage.sortSelect).toHaveValue(sortValue)
        expect(new URL(page.url()).searchParams.get('sort')).toBe(sortValue)
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

    await test.step('clear all resets sort and material filter', async () => {
      await prnsListPage.clickClearAll()

      await expect(
        prnsListPage.sortSelect.locator('option:checked')
      ).toHaveText('Date issued (newest first)')
      await expect(prnsListPage.materialSelect).toHaveValue('')
      const url = new URL(page.url())
      expect(url.searchParams.get('sort')).toBeNull()
      expect(url.searchParams.get('material')).toBeNull()
    })
  })
})
