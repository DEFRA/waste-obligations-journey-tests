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
import { materialTarget } from '../data/material-targets.data.js'

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
  {
    api: 'Aluminium',
    link: 'Aluminium recycling obligation page',
    name: 'aluminium'
  },
  {
    api: 'Paper',
    link: 'Paper, board or fibre-based composite material recycling obligation page',
    name: 'paper, board or fibre-based composite material'
  },
  {
    api: 'Plastic',
    link: 'Plastic recycling obligation page',
    name: 'plastic'
  },
  { api: 'Steel', link: 'Steel recycling obligation page', name: 'steel' },
  { api: 'Wood', link: 'Wood recycling obligation page', name: 'wood' }
]

const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })

// An amount as the page writes it: "1 tonne", otherwise "600 tonnes".
function tonnes(amount) {
  return `${number.format(amount)} ${amount === 1 ? 'tonne' : 'tonnes'}`
}

// The target line and the written example the page gives for a material. The
// reported and obligated tonnages come from the API; the target is the one the
// regulations set for the year, which the page shows whatever the API holds.
function writtenExample(material, obligation) {
  const reported = obligation?.tonnages?.material ?? 0
  const obligated = obligation?.tonnages?.obligated ?? 0
  const target = materialTarget(material.api, YEAR)

  return [
    `Y is ${target}% (recycling target for ${material.name} set by the 2024 regulations)`,
    `${tonnes(reported)} x ${target}% = ${tonnes(obligated)}.`
  ]
}

// A material with no reported tonnage has no written example, so the page shows
// none; otherwise it shows the formula, the year's target and the worked figures.
// The lines found on the page are compared with the lines expected, so a mismatch
// shows both.
async function expectWrittenExample(
  materialCalculationPage,
  material,
  obligation
) {
  const shown = (obligation?.tonnages?.material ?? 0) > 0
  const lines = ['X x Y = Z', ...writtenExample(material, obligation)]

  await materialCalculationPage.expectCalculationShown(shown)
  await expect
    .poll(async () => {
      const text = await materialCalculationPage.main.innerText()

      return lines.filter((line) => text.includes(line))
    })
    .toEqual(shown ? lines : [])
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
            materialCalculationPage,
            material,
            obligations.find((o) => o.material === material.api)
          )
        })

        await test.step(`${material.name}: returns to the obligations page`, async () => {
          await materialCalculationPage.returnToObligations()
          await obligationsPage.expectLoadedForYear(YEAR)
        })
      }
    })

    test("glass opens the glass calculation with its breakdown and the year's targets", async ({
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
      await obligationsPage.openMaterialCalculation(
        'Remaining glass recycling obligation page'
      )

      await materialCalculationPage.expectLoadedFor(YEAR, 'glass')
      await materialCalculationPage.expectGlassBreakdown()
      await expect(materialCalculationPage.main).toContainText(
        `Y is ${materialTarget('Glass', YEAR)}% (recycling target for glass set by the 2024 regulations)`
      )
      await expect(materialCalculationPage.main).toContainText(
        `T is ${materialTarget('GlassRemelt', YEAR)}% (recycling target for glass re-melt set by the 2024 regulations)`
      )
    })
  })
}
