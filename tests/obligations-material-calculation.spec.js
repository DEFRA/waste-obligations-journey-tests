import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '../fixtures/pages.fixture.js'
import {
  skipUnlessFeatureFlagEnabled,
  skipUnlessEnabled,
  FEATURE_MANAGE_OBLIGATIONS
} from '../utils/environment-features.js'
import {
  getObligationsUrl,
  getWasteObligationsFrontendBaseUrl,
  usesPackagingEntryPoint
} from '../utils/journey-entry-point.js'
import { getJourneyYear } from '../utils/journey-year.js'
import { getOrgId, readObligations } from '../utils/waste-obligations-api.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_DIR = path.join(__dirname, '..', 'playwright', '.auth')

const YEAR = getJourneyYear()

const ACCOUNTS = [
  { account: 'dp', label: 'Producer (DP)', authFile: 'dp.json' },
  { account: 'cso', label: 'Compliance scheme (CSO)', authFile: 'cso.json' }
]

// The link text on the obligations table, the material in the API, and the
// name the calculation page gives the material in its heading.
const MATERIALS = [
  { api: 'Aluminium', link: 'Aluminium', name: 'aluminium' },
  {
    api: 'Paper',
    link: 'Paper, board or fibre-based composite material',
    name: 'paper, board or fibre-based composite material'
  },
  { api: 'Plastic', link: 'Plastic', name: 'plastic' },
  { api: 'Steel', link: 'Steel', name: 'steel' },
  { api: 'Wood', link: 'Wood', name: 'wood' }
]

const tonnes = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })

// The written example the page gives for a material, from what the API holds.
function writtenExample(obligation) {
  const reported = obligation?.tonnages?.material ?? 0
  const percent = Math.round((obligation?.recyclingTarget ?? 0) * 100)
  const obligated = obligation?.tonnages?.obligated ?? 0

  return `${tonnes.format(reported)} tonnes x ${percent}% = ${tonnes.format(obligated)} tonnes.`
}

// A material with no reported tonnage has no written example, so the page shows
// none; otherwise it shows the formula and the worked figures.
async function expectWrittenExample(page, obligation) {
  const reported = obligation?.tonnages?.material ?? 0
  const count = Number(reported > 0)

  await expect(page.getByText('X x Y = Z')).toHaveCount(count)
  await expect(
    page.getByText(writtenExample(obligation), { exact: false })
  ).toHaveCount(count)
}

for (const { account, label, authFile } of ACCOUNTS) {
  test.describe(`Material calculation pages - ${label}`, () => {
    test.use({ storageState: path.join(AUTH_DIR, authFile) })

    test.beforeEach(() => {
      skipUnlessFeatureFlagEnabled(FEATURE_MANAGE_OBLIGATIONS)
      skipUnlessEnabled(
        !usesPackagingEntryPoint(),
        'The material calculation pages are reached from the CDP obligations page'
      )
    })

    test('each material opens its calculation page and returns to the obligations page', async ({
      page,
      request,
      obligationsPage,
      materialCalculationPage
    }) => {
      const obligations = await readObligations(
        request,
        getOrgId(account),
        YEAR
      )
      const obligationsUrl = new URL(
        getObligationsUrl(account, YEAR).toString(),
        getWasteObligationsFrontendBaseUrl()
      ).toString()

      await page.goto(obligationsUrl, { timeout: 60_000 })
      await obligationsPage.expectLoadedForYear(YEAR)
      await obligationsPage.dismissCookieBannerIfShown()

      for (const material of MATERIALS) {
        await test.step(`${material.name}: opens its calculation page`, async () => {
          await obligationsPage.openMaterialCalculation(material.link)
          await materialCalculationPage.expectLoadedFor(YEAR, material.name)
          await expectWrittenExample(
            page,
            obligations.find((o) => o.material === material.api)
          )
        })

        await test.step(`${material.name}: returns to the obligations page`, async () => {
          await materialCalculationPage.returnToObligations()
          await obligationsPage.expectLoadedForYear(YEAR)
        })
      }
    })

    test('glass opens the glass calculation with its breakdown', async ({
      page,
      obligationsPage,
      materialCalculationPage
    }) => {
      const obligationsUrl = new URL(
        getObligationsUrl(account, YEAR).toString(),
        getWasteObligationsFrontendBaseUrl()
      ).toString()

      await page.goto(obligationsUrl, { timeout: 60_000 })
      await obligationsPage.expectLoadedForYear(YEAR)
      await obligationsPage.dismissCookieBannerIfShown()
      await obligationsPage.openMaterialCalculation('Remaining glass')

      await materialCalculationPage.expectLoadedFor(YEAR, 'glass')
      await expect(materialCalculationPage.glassIntroduction).toBeVisible()
      await expect(
        page.getByRole('heading', { name: 'Glass re-melt obligation' })
      ).toBeVisible()
      await expect(
        page.getByRole('heading', { name: 'Remaining glass obligation' })
      ).toBeVisible()
    })
  })
}
