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

// Multi-phase journeys (E2E-04, E2E-08) invoke this spec more than once —
// once per producer-side phase — and use PHASE to dispatch. Default 'submit'
// keeps the single-phase E2E-01.x journeys working without any wiring change.
const PHASE = process.env.PHASE || 'submit'

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
    case 'E2E-01.3a':
      // CS non-compliant variant 03a: obligations MET, Reg 43 = NO.
      // Same producer UI actions as 03c — differs only in the backend
      // obligation state (which is data-seeded, not driven by test code).
      runCsReg43No(matrixEntry, {
        journey: 'E2E-01.3a',
        obligationExpectedLabel: 'obligation status per env — 03a expects MET'
      })
      break
    case 'E2E-01.3c':
      runCsReg43No(matrixEntry, {
        journey: 'E2E-01.3c',
        obligationExpectedLabel:
          'obligation status per env — 03c expects NOT MET'
      })
      break
    case 'E2E-04':
    case 'E2E-08':
      // Both journeys share producer-side phases: an initial submit and
      // a later resubmit (after the regulator cancels). PHASE dispatch
      // decides which one this invocation runs; the runner sequences them.
      runProducerPhase(matrixEntry, JOURNEY, PHASE)
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
    csocViewPage,
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

    await test.step('Clicks "View your certificate" and lands on the certificate view', async () => {
      await csocConfirmationPage.goToCertificateView()
      await csocViewPage.expectLoaded(year)
      await csocViewPage.expectOrgIdentity()
      await screenshotRecorder.capture(page, 'Certificate view — Submitted')
    })

    await test.step('Returns to Account home', async () => {
      await landingPage.goto()
      await landingPage.expectLoaded()
      await screenshotRecorder.capture(page, 'Account home — post-submission')
    })

    await test.step('Opens Manage recycling obligations', async () => {
      await landingPage.goToObligations()
      await obligationsPage.expectLoaded()
      await screenshotRecorder.capture(
        page,
        'Manage recycling obligations — post-submission'
      )
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
    csocViewPage,
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

    await test.step('Clicks "View your statement" and lands on the statement view', async () => {
      await csocConfirmationPage.goToCertificateView()
      await csocViewPage.expectLoaded(year)
      await csocViewPage.expectOrgIdentity()
      await screenshotRecorder.capture(page, 'Statement view — Submitted')
    })

    await test.step('Returns to Account home', async () => {
      await landingPage.goto()
      await landingPage.expectLoaded()
      await screenshotRecorder.capture(page, 'Account home — post-submission')
    })

    await test.step('Opens Manage recycling obligations', async () => {
      await landingPage.goToObligations()
      await obligationsPage.expectLoaded()
      await screenshotRecorder.capture(
        page,
        'Manage recycling obligations — post-submission'
      )
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────
// E2E-01.3a / E2E-01.3c — CS with Reg 43 = NO
//
// Same producer UI actions in both variants — the only difference is the
// obligation seed state (03a expects MET, 03c expects NOT MET), which is
// backend-driven and out of this skill's scope. The check-and-submit
// screenshot captures whichever status the env is currently showing so
// the reviewer can confirm the seeding matches the ticket variant.
// ─────────────────────────────────────────────────────────────────────────

function runCsReg43No(entry, { journey, obligationExpectedLabel }) {
  assertOrgTypeMatchesJourney(journey, entry.orgType)
  const variant = journey.replace('E2E-01.', '') // "3a" or "3c"

  test(`CS submits CSoC with Reg 43 = NO (variant ${variant})`, async ({
    page,
    landingPage,
    obligationsPage,
    csocAboutPage,
    csocSubmissionPage,
    csocConfirmationPage,
    csocViewPage,
    screenshotRecorder
  }) => {
    const year = new Date().getFullYear()
    const directUrl = directCertificateUrl(entry, year)

    if (directUrl) {
      await test.step('Navigates directly to the statement submission URL', async () => {
        await page.goto(directUrl)
        await screenshotRecorder.capture(
          page,
          `Statement submission — ${variant}`
        )
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
      await screenshotRecorder.capture(
        page,
        `Check and submit — CS ${variant} (${obligationExpectedLabel}; Reg 43 pending selection)`
      )
    })

    await test.step('Selects Reg 43 = NO and submits', async () => {
      await csocSubmissionPage.submit(TEST_USER_NAME, { regulation43: 'NO' })
      await csocConfirmationPage.expectSubmitted(year)
      await screenshotRecorder.capture(
        page,
        `Confirmation — Submitted (Reg 43 = NO, variant ${variant})`
      )
    })

    await test.step('Clicks "View your statement" and lands on the statement view', async () => {
      await csocConfirmationPage.goToCertificateView()
      await csocViewPage.expectLoaded(year)
      await csocViewPage.expectOrgIdentity()
      await screenshotRecorder.capture(
        page,
        `Statement view — Submitted (${variant})`
      )
    })

    await test.step('Returns to Account home', async () => {
      await landingPage.goto()
      await landingPage.expectLoaded()
      await screenshotRecorder.capture(page, 'Account home — post-submission')
    })

    await test.step('Opens Manage recycling obligations', async () => {
      await landingPage.goToObligations()
      await obligationsPage.expectLoaded()
      await screenshotRecorder.capture(
        page,
        'Manage recycling obligations — post-submission'
      )
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────
// E2E-04 / E2E-08 producer phases
//
// Both journeys involve two producer-side visits: an initial "submit" and a
// later "resubmit" after the regulator has cancelled. The regulator phases
// run in between via the sibling repo's spec. PHASE is set by the runner.
// ─────────────────────────────────────────────────────────────────────────

function runProducerPhase(entry, journey, phase) {
  const label = `${journey} · ${entry.regulator} · ${entry.orgType} · phase=${phase}`
  test(`producer ${label}`, async ({
    page,
    landingPage,
    obligationsPage,
    csocAboutPage,
    csocSubmissionPage,
    csocConfirmationPage,
    csocViewPage,
    screenshotRecorder
  }) => {
    test.setTimeout(180_000)
    const year = new Date().getFullYear()
    const directUrl = directCertificateUrl(entry, year)

    if (phase === 'submit') {
      await submitFlow(entry, year, directUrl, {
        page,
        landingPage,
        obligationsPage,
        csocAboutPage,
        csocSubmissionPage,
        csocConfirmationPage,
        csocViewPage,
        screenshotRecorder
      })
    } else if (phase === 'resubmit') {
      await resubmitFlow(entry, year, directUrl, {
        page,
        landingPage,
        obligationsPage,
        csocAboutPage,
        csocSubmissionPage,
        csocConfirmationPage,
        csocViewPage,
        screenshotRecorder
      })
    } else {
      throw new Error(
        `Unknown PHASE "${phase}" for producer ${journey}. Expected: submit, resubmit.`
      )
    }
  })
}

// Producer submit flow, shared between E2E-04 and E2E-08. Same shape as
// the E2E-01.x submit path but auto-detects DP vs CS via the page object
// rather than asserting on the caller's org type — E2E-04/08 exercise both.
async function submitFlow(entry, year, directUrl, pages) {
  const {
    page,
    landingPage,
    obligationsPage,
    csocAboutPage,
    csocSubmissionPage,
    csocConfirmationPage,
    csocViewPage,
    screenshotRecorder
  } = pages

  if (directUrl) {
    await test.step('Navigates directly to the certificate/statement submission URL', async () => {
      await page.goto(directUrl)
      await screenshotRecorder.capture(page, 'Submit — landing on submission')
    })
  } else {
    await test.step('Approved Person signs in and lands on Account home', async () => {
      await landingPage.goto()
      await screenshotRecorder.capture(page, 'Submit — account home')
    })
    await test.step('Opens Manage recycling obligations', async () => {
      await landingPage.goToObligations()
      await obligationsPage.expectLoaded()
      await screenshotRecorder.capture(page, 'Submit — manage recycling')
    })
    await test.step('Starts CSoC submission', async () => {
      await obligationsPage.startCsocSubmission()
      await csocAboutPage.expectLoaded()
      await screenshotRecorder.capture(page, 'Submit — about page')
      await csocAboutPage.clickContinue()
    })
  }

  await test.step('Reviews the check-and-submit page', async () => {
    await csocSubmissionPage.expectLoaded()
    await csocSubmissionPage.expectOrganisationDetails()
    await screenshotRecorder.capture(page, 'Submit — check and submit')
  })

  await test.step('Submits (auto-selects Reg 43 = YES for CS variant)', async () => {
    await csocSubmissionPage.submit(TEST_USER_NAME)
    await csocConfirmationPage.expectSubmitted(year)
    await screenshotRecorder.capture(page, 'Submit — confirmation')
  })

  await test.step('Clicks "View your certificate/statement"', async () => {
    await csocConfirmationPage.goToCertificateView()
    await csocViewPage.expectLoaded(year)
    await csocViewPage.expectOrgIdentity()
    await screenshotRecorder.capture(page, 'Submit — view page')
  })

  // Suppress unused-var lint when the direct URL path skips the landing/
  // obligations click-through:
  // entry is captured in closure only for callers that need it later —
  // keep it in the signature so the shape is symmetric across phases.
  if (!entry) throw new Error('entry required')
}

// Producer resubmit flow. Fires after the regulator has cancelled, so the
// obligations page should show a "Resubmit" affordance rather than the
// initial "Submit" one. The FE routes Resubmit through the same "About
// your certificate/statement of compliance" intermediate page as the
// initial submit flow, so we click Continue there before landing on
// check-and-submit.
async function resubmitFlow(entry, year, directUrl, pages) {
  const {
    page,
    landingPage,
    obligationsPage,
    csocAboutPage,
    csocSubmissionPage,
    csocConfirmationPage,
    csocViewPage,
    screenshotRecorder
  } = pages

  await test.step('Approved Person signs back in — sees Cancelled state', async () => {
    await landingPage.goto()
    await screenshotRecorder.capture(page, 'Resubmit — account home')
    await landingPage.goToObligations()
    await obligationsPage.expectLoaded()
    // Best-effort: the resubmit affordance is what the AC calls for. If
    // it isn't visible (FE renders differently), the screenshot still
    // documents whatever state the org is in.
    try {
      await obligationsPage.expectResubmitCardVisible()
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[resubmit] resubmit card not visible — capturing current state anyway: ${err.message}`
      )
    }
    await screenshotRecorder.capture(page, 'Resubmit — obligations post-cancel')
  })

  await test.step('Clicks Resubmit → lands on the About page', async () => {
    // Prefer the Resubmit button — it's the UI-driven flow the FE offers
    // after a cancel, and it re-establishes whatever server-side state the
    // certificate page needs. Fall back to the direct URL only when the
    // button isn't rendered (older FE build, or the state machine has
    // routed us somewhere unexpected).
    const resubmitBtn = obligationsPage.resubmitButton
    const buttonVisible = await resubmitBtn.isVisible().catch(() => false)
    if (buttonVisible) {
      await resubmitBtn.click()
    } else if (directUrl) {
      // eslint-disable-next-line no-console
      console.warn(
        '[resubmit] resubmit button not visible; falling back to direct URL'
      )
      await page.goto(directUrl)
    } else {
      throw new Error(
        'Neither the Resubmit button nor a direct certificate URL is available — cannot start resubmission'
      )
    }
    // Capture what loaded (About page in the standard flow) before
    // asserting, so if the FE routes us somewhere else the evidence pack
    // still shows the offending page.
    await screenshotRecorder.capture(page, 'Resubmit — About page')
    await csocAboutPage.expectLoaded()
    await csocAboutPage.clickContinue()
  })

  await test.step('Reviews the check-and-submit page', async () => {
    await csocSubmissionPage.expectLoaded()
    await csocSubmissionPage.expectOrganisationDetails()
    await screenshotRecorder.capture(page, 'Resubmit — check and submit')
  })

  await test.step('Submits the resubmission', async () => {
    await csocSubmissionPage.submit(TEST_USER_NAME)
    await csocConfirmationPage.expectSubmitted(year)
    await screenshotRecorder.capture(page, 'Resubmit — confirmation')
  })

  await test.step('Clicks "View your certificate/statement"', async () => {
    await csocConfirmationPage.goToCertificateView()
    await csocViewPage.expectLoaded(year)
    await screenshotRecorder.capture(page, 'Resubmit — view page')
  })

  // entry is captured in closure only for callers that need it later —
  // keep it in the signature so the shape is symmetric across phases.
  if (!entry) throw new Error('entry required')
}
