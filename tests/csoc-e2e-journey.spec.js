import { test, expect } from '../fixtures/pages.fixture.js'
import { JOURNEYS, TEST_USER_NAME } from '../data/csoc.data.js'
import { resolveMatrixEntry } from '../.claude/skills/csoc-e2e/data/matrix.js'
import { resetOrgDeclarations } from '../utils/test-setup.js'

// Producer-side runner for the CSoC E2E matrix. One combined test executes the
// journey selected by env vars set by .claude/skills/csoc-e2e/runner.mjs.
//   JOURNEY   — one of data/csoc.data.js:JOURNEYS
//   REGULATOR — EA | NRW | SEPA | NIEA
//   ORG_TYPE  — DRP | CS
//   EVIDENCE_DIR — directory the screenshotRecorder writes into
//
// E2E-01.1 (DRP happy path) and E2E-01.2 (CS compliant) are implemented in
// full. Every other journey is present as a `test.fixme` scaffold with a TODO
// linking to the plan doc — the harness (matrix dispatch, screenshots, docx
// build) works today, and each journey drops into its slot as it lands.
//
// Public register, notification email, and PRN steps are intentionally out of
// scope per the CSoC E2E plan.

const JOURNEY = process.env.JOURNEY
const REGULATOR = process.env.REGULATOR
const ORG_TYPE = process.env.ORG_TYPE
const ORG_TYPE_ACCOUNT = ORG_TYPE === 'CS' ? 'cso' : 'dp'

// Skill-driven spec: collection is a no-op when the harness env is absent, so
// the existing `npm run test:e2e` sweep leaves this file alone. Fail fast only
// when JOURNEY is set but doesn't match the known list — that indicates the
// runner made a typo, not a benign default run.
const IS_HARNESS_RUN = Boolean(JOURNEY && REGULATOR && ORG_TYPE)
if (JOURNEY && !JOURNEYS.includes(JOURNEY)) {
  throw new Error(
    `Unknown JOURNEY "${JOURNEY}". Expected one of: ${JOURNEYS.join(', ')}`
  )
}

// CS runs use the CSO storage state produced by auth/cso-auth.setup.js. DP
// uses the default state from auth/auth.setup.js. Storage state paths must be
// pinned before the tests declare — Playwright reads them at collection time.
const storageState =
  ORG_TYPE === 'CS' ? 'playwright/.auth/cso.json' : 'playwright/.auth/dp.json'

test.use({ storageState })

// The shared backend org must start empty so status assertions are deterministic.
test.describe.configure({ mode: 'serial' })

test.describe(`CSoC ${JOURNEY ?? '<unset>'} · ${REGULATOR ?? '<unset>'} · ${ORG_TYPE ?? '<unset>'}`, () => {
  test.skip(
    !IS_HARNESS_RUN,
    'CSoC E2E harness env vars not set — this spec is skill-driven'
  )
  const matrixEntry = IS_HARNESS_RUN
    ? resolveMatrixEntry(REGULATOR, ORG_TYPE)
    : null

  test.beforeAll(async () => {
    if (!IS_HARNESS_RUN) return
    try {
      await resetOrgDeclarations(ORG_TYPE_ACCOUNT)
    } catch (err) {
      // The declarations API sits on a different host than the FE, and if it's
      // unreachable (VPN, DNS, wrong URL) the E2E can still exercise a clean
      // journey — we'd rather run and let the assertions show the state than
      // fail before capturing a single screenshot.
      // eslint-disable-next-line no-console
      console.warn(
        `[csoc-e2e] resetOrgDeclarations failed, continuing: ${err.message}`
      )
    }
  })

  test.beforeEach(async ({ page }) => {
    // Guardrail: without the recorder the harness produces an empty docx. We
    // keep the ability to run this spec by hand for debugging (skips capture)
    // but log loudly when EVIDENCE_DIR is absent.
    if (!process.env.EVIDENCE_DIR) {
      // eslint-disable-next-line no-console
      console.warn(
        '[csoc-e2e] EVIDENCE_DIR not set — running without screenshot capture'
      )
    }
    // Slow default nav slightly — regulator env cold-start pages can otherwise
    // paint before assets settle.
    page.setDefaultNavigationTimeout(45_000)
  })

  if (!IS_HARNESS_RUN) {
    test('placeholder', () => {}) // covered by test.skip above
    return
  }

  switch (JOURNEY) {
    case 'E2E-01.1':
      runDrpHappyPath(matrixEntry)
      break
    case 'E2E-01.2':
      runCsCompliant(matrixEntry)
      break
    default:
      test.fixme(`${JOURNEY}: not implemented yet — scaffold only`, () => {
        // Journey stubs land here so `--matrix all` doesn't blow up. See
        // plans/given-this-is-the-purrfect-sutton.md for what each needs.
      })
      break
  }
})

function assertOrgTypeMatchesJourney(journey, orgType) {
  const drpOnly = ['E2E-01.1']
  const csOnly = ['E2E-01.2', 'E2E-01.3a', 'E2E-01.3b', 'E2E-01.3c']
  if (drpOnly.includes(journey) && orgType !== 'DRP') {
    throw new Error(`${journey} only runs against DRP org type`)
  }
  if (csOnly.includes(journey) && orgType !== 'CS') {
    throw new Error(`${journey} only runs against CS org type`)
  }
}

// Newer producer FE (tst) mounts the certificate submission directly at
//   /manage-recycling-obligations/producer/{orgId}/compliance/certificate?year={year}
// bypassing the /report-data landing page. When EPR_CERTIFICATE_URL_TEMPLATE
// is set (via the runner or .env), we navigate straight there and skip the
// landing → obligations click-through. Placeholders {orgId} and {year} are
// substituted from the matrix entry.
function directCertificateUrl(entry, year) {
  const template = process.env.EPR_CERTIFICATE_URL_TEMPLATE
  if (!template) return null
  return template
    .replace('{orgId}', entry.organisationId)
    .replace('{year}', String(year))
}

function runDrpHappyPath(entry) {
  assertOrgTypeMatchesJourney('E2E-01.1', entry.orgType)

  test('DRP submits CSoC and it appears ready for regulator approval', async ({
    page,
    landingPage,
    obligationsPage,
    csocAboutPage,
    csocSubmissionPage,
    csocConfirmationPage,
    screenshotRecorder
  }) => {
    const year = new Date().getFullYear()
    const directUrl = directCertificateUrl(entry, year)

    if (directUrl) {
      await test.step('Navigates directly to the certificate submission URL', async () => {
        await page.goto(directUrl)
        await screenshotRecorder.capture(page, 'Certificate submission')
      })
    } else {
      await test.step('Approved Person signs in and lands on Account home', async () => {
        await landingPage.goto()
        await screenshotRecorder.capture(page, 'Account home')
      })

      await test.step('Opens Manage recycling obligations', async () => {
        await landingPage.goToObligations()
        await obligationsPage.expectLoaded()
        await screenshotRecorder.capture(page, 'Manage recycling obligations')
      })

      await test.step('Starts CSoC submission', async () => {
        await obligationsPage.startCsocSubmission()
        await csocAboutPage.expectLoaded()
        await screenshotRecorder.capture(
          page,
          'About your Certificate of Compliance'
        )
        await csocAboutPage.clickContinue()
      })
    }

    await test.step('Reviews the check-and-submit page (Reg 43 hidden for DRP)', async () => {
      await csocSubmissionPage.expectLoaded()
      await csocSubmissionPage.expectOrganisationDetails()
      expect(await csocSubmissionPage.isCsoVariant()).toBe(false)
      await expect(csocSubmissionPage.regulation43Fieldset).toHaveCount(0)
      await screenshotRecorder.capture(page, 'Check and submit — DRP')
    })

    await test.step('Submits with the Approved Person full name', async () => {
      await csocSubmissionPage.submit(TEST_USER_NAME)
      await csocConfirmationPage.expectSubmitted(year)
      await screenshotRecorder.capture(page, 'Confirmation — Submitted')
    })

    // The regulator-side approve happens in the sibling repo. See:
    //   waste-packaging-regulator-tests/test/specs/csoc-e2e-external.spec.js
    // The skill runner chains the two runs and merges their screenshots.
  })
}

function runCsCompliant(entry) {
  assertOrgTypeMatchesJourney('E2E-01.2', entry.orgType)

  test('CS submits CSoC with Reg 43 = YES and it appears ready for approval', async ({
    page,
    landingPage,
    obligationsPage,
    csocAboutPage,
    csocSubmissionPage,
    csocConfirmationPage,
    screenshotRecorder
  }) => {
    const year = new Date().getFullYear()
    const directUrl = directCertificateUrl(entry, year)

    if (directUrl) {
      await test.step('Navigates directly to the statement submission URL', async () => {
        await page.goto(directUrl)
        await screenshotRecorder.capture(page, 'Statement submission')
      })
    } else {
      await test.step('Approved Person signs in and lands on Account home', async () => {
        await landingPage.goto()
        await screenshotRecorder.capture(page, 'Account home')
      })

      await test.step('Opens Manage recycling obligations', async () => {
        await landingPage.goToObligations()
        await obligationsPage.expectLoaded()
        await screenshotRecorder.capture(page, 'Manage recycling obligations')
      })

      await test.step('Starts CSoC submission', async () => {
        await obligationsPage.startCsocSubmission()
        await csocAboutPage.expectLoaded()
        await screenshotRecorder.capture(
          page,
          'About your Statement of Compliance'
        )
        await csocAboutPage.clickContinue()
      })
    }

    await test.step('Reviews the check-and-submit page (Reg 43 visible for CS)', async () => {
      await csocSubmissionPage.expectLoaded()
      await csocSubmissionPage.expectOrganisationDetails()
      expect(await csocSubmissionPage.isCsoVariant()).toBe(true)
      await expect(csocSubmissionPage.regulation43Fieldset).toBeVisible()
      await screenshotRecorder.capture(page, 'Check and submit — CS')
    })

    await test.step('Selects Reg 43 = YES and submits', async () => {
      // submit() auto-selects the YES radio when the fieldset is present.
      await csocSubmissionPage.submit(TEST_USER_NAME)
      await csocConfirmationPage.expectSubmitted(year)
      await screenshotRecorder.capture(page, 'Confirmation — Submitted')
    })
  })
}
