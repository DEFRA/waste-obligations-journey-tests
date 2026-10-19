import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { usesPackagingEntryPoint } from '../utils/journey-entry-point.js'
import { skipUnlessPrnsConfigured } from '../utils/environment-features.js'
import { getJourneyYear } from '../utils/journey-year.js'
import { getOrgId, listAwaitingPrns } from '../utils/waste-obligations-api.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The Azure Packaging (RPD) accept or reject list and its Manage obligations
// page. They only exist behind the Packaging entry point, and the seeded notes
// they rely on only on LOCAL, so every other target skips.
const BASE = '/report-data'
const OBLIGATIONS = `${BASE}/manage-your-recycling-obligations`
const LIST = `${BASE}/view-awaiting-acceptance-alt`
const SELECTION_KEY_PREFIX = 'chkBoxSelectPrn_'

const YEAR = getJourneyYear()
const PREVIOUS_YEAR = YEAR - 1
const NEXT_YEAR = YEAR + 1

// Choosing a year on Manage obligations sets the year the list uses. Returns
// the year the page actually applied, which differs when it isn't selectable.
async function chooseYear(page, year) {
  await page.goto(`${OBLIGATIONS}?year=${year}`)
  const heading = await page.getByRole('heading', { level: 1 }).innerText()
  return Number(heading.match(/(\d{4})/)?.[1])
}

// The year other than YEAR that the page will apply: the next year once it is
// selectable (the December window), otherwise the year before.
async function chooseOtherYear(page) {
  for (const candidate of [NEXT_YEAR, PREVIOUS_YEAR]) {
    if ((await chooseYear(page, candidate)) === candidate) {
      return candidate
    }
  }

  throw new Error(`Neither ${NEXT_YEAR} nor ${PREVIOUS_YEAR} can be selected.`)
}

test.use({
  storageState: path.join(__dirname, '..', 'playwright', '.auth', 'dp.json')
})

test.describe('Packaging PRNs list is filtered by year (DP)', () => {
  test.beforeEach(() => {
    test.skip(
      !usesPackagingEntryPoint(),
      'The Packaging pages are only reachable from the Packaging entry point'
    )
    test.skip(
      process.env.ENVIRONMENT !== 'local',
      'These checks rely on the seeded LOCAL notes'
    )
    skipUnlessPrnsConfigured()
  })

  async function readAwaitingCount(page) {
    const figure = page
      .locator('.govuk-inset-text')
      .filter({ hasText: /awaiting acceptance/i })
      .locator('p.govuk-body-l')
    await expect(figure).toBeVisible()
    return Number((await figure.textContent()).trim())
  }

  async function listedNumbers(page, params = '') {
    await page.goto(`${LIST}?pageSize=100${params}`)
    return page
      .locator('table tbody tr:has(a)')
      .evaluateAll((rows) =>
        rows.map((row) => row.querySelector('a').textContent.trim())
      )
  }

  test('the obligations count equals the list total for the year', async ({
    page
  }) => {
    for (const year of [PREVIOUS_YEAR, YEAR]) {
      await test.step(`${year}: the count matches the list`, async () => {
        expect(await chooseYear(page, year)).toBe(year)
        const count = await readAwaitingCount(page)
        const numbers = await listedNumbers(page)

        expect(
          count,
          `Manage obligations counts ${count} awaiting for ${year} but the list shows ${numbers.length}.`
        ).toBe(numbers.length)
      })
    }
  })

  test('a standard note is listed only for the year it can be accepted into', async ({
    page,
    request
  }) => {
    const prns = await listAwaitingPrns(request, getOrgId('dp'))
    const standard = prns.find(
      (prn) => prn.decemberWaste === false && prn.obligationYear === YEAR
    )
    expect(
      standard,
      `The local fixture must seed a standard ${YEAR} PRN awaiting acceptance.`
    ).toBeDefined()

    await test.step(`it is on the ${YEAR} list`, async () => {
      expect(await chooseYear(page, YEAR)).toBe(YEAR)
      expect(await listedNumbers(page)).toContain(standard.number)
    })

    await test.step('it is not on the other year list', async () => {
      await chooseOtherYear(page)
      expect(await listedNumbers(page)).not.toContain(standard.number)
    })
  })

  test('a page past the last shows the last page, not an empty list', async ({
    page
  }) => {
    expect(await chooseYear(page, YEAR)).toBe(YEAR)
    const all = await listedNumbers(page)
    test.skip(all.length < 2, `Fewer than two ${YEAR} notes to page through`)

    await page.goto(`${LIST}?pageSize=1&page=999`)

    await expect(
      page.getByRole('heading', { name: /^accept or reject prns and perns/i })
    ).toBeVisible()
    await expect(page.locator('table tbody tr:has(a)')).toHaveCount(1)
  })

  test('selections ticked on one year are cleared when the year changes', async ({
    page
  }) => {
    await test.step(`tick a note on the ${YEAR} list`, async () => {
      expect(await chooseYear(page, YEAR)).toBe(YEAR)
      await page.goto(`${LIST}?pageSize=100`)
      await page
        .locator('table input[type="checkbox"]:not(:disabled)')
        .first()
        .check()
      const kept = await page.evaluate(
        (prefix) =>
          Object.keys(sessionStorage).filter((key) => key.startsWith(prefix))
            .length,
        SELECTION_KEY_PREFIX
      )
      expect(kept).toBeGreaterThan(0)
    })

    await test.step('open the other year list', async () => {
      const otherYear = await chooseOtherYear(page)
      const numbers = await listedNumbers(page)
      test.skip(
        numbers.length === 0,
        `The ${otherYear} list is empty on this date, so there is no list to carry a selection into`
      )
    })

    await test.step('the selection from the other year is gone', async () => {
      const kept = await page.evaluate(
        (prefix) =>
          Object.keys(sessionStorage).filter((key) => key.startsWith(prefix))
            .length,
        SELECTION_KEY_PREFIX
      )
      expect(kept).toBe(0)
      await expect(
        page.locator('table input[type="checkbox"]:checked')
      ).toHaveCount(0)
    })
  })
})
