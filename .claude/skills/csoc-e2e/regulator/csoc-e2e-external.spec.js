import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { CertificatesPage } from '../page-objects/certificates.page.js'
import { CertificatesDetailPage } from '../page-objects/certificates.detail.page.js'
import { CertificatesAcceptPage } from '../page-objects/certificates.accept.page.js'
import { CertificatesCancelReasonPage } from '../page-objects/certificates.cancel-reason.page.js'
import { CertificatesCancelCheckPage } from '../page-objects/certificates.cancel-check.page.js'

// Regulator-side companion spec for the CSoC E2E skill orchestrator in
// waste-obligations-journey-tests. Runs after the producer submits the
// declaration, then approves it (E2E-01.1/E2E-01.2) or performs cancel/
// re-approve flows (E2E-04/E2E-08).
//
// Screenshots are written into $EVIDENCE_DIR/screenshots/ using the same
// NNN_slug.png convention as the producer spec. SCREENSHOT_START_AT keeps the
// counter continuous across the two runs so the docx builder just sorts by
// filename.
//
// Required env: JOURNEY, REGULATOR (EA|NRW|SEPA|NIEA), ORG_TYPE (DRP|CS),
// ORG_ID (organisationId), EVIDENCE_DIR, SCREENSHOT_START_AT.
// Also reads TEST_EMAIL_NATION_${NATION_ID} / TEST_PASSWORD_NATION_${NATION_ID}
// for the inline B2C login (the shared auth.setup.js is bypassed on purpose —
// see below).

const JOURNEY = process.env.JOURNEY
const REGULATOR = process.env.REGULATOR
const ORG_TYPE = process.env.ORG_TYPE
const ORG_ID = process.env.ORG_ID
const NATION_ID = process.env.NATION_ID
const EVIDENCE_DIR = process.env.EVIDENCE_DIR
const SCREENSHOT_START_AT = Number(process.env.SCREENSHOT_START_AT || 100)

// Multi-phase journeys (E2E-04, E2E-08) invoke this spec once per
// regulator-side phase (approve / cancel / view-history). Default 'approve'
// keeps E2E-01.x working without any wiring change.
const PHASE = process.env.PHASE || 'approve'
// Shared reason used for the cancel flow — one of the four canonical
// options accepted by both DRP and CS journeys per the FE spec.
const CANCEL_REASON = 'Recycling obligations changed'

// Human-friendly labels for the regulator we're logged in as. Included in
// every screenshot caption so the reviewer never has to guess which
// jurisdiction/regulator produced the evidence.
const REGULATOR_LABELS = {
  EA: 'EA / England',
  NRW: 'NRW / Wales',
  SEPA: 'SEPA / Scotland',
  NIEA: 'NIEA / Northern Ireland'
}
const REGULATOR_LABEL = REGULATOR_LABELS[REGULATOR] ?? REGULATOR ?? '<unknown>'
const CAPTION_PREFIX = `Regulator (${REGULATOR_LABEL})`

// Skill-driven spec: skip at runtime when the harness env is not set so the
// existing regulator test suite is unaffected.
const IS_HARNESS_RUN = Boolean(JOURNEY && REGULATOR && ORG_TYPE && ORG_ID)

// Force a clean browser context every run. The shared auth.setup.js goes
// through the dashboard host and stores its cookies there, but the packaging
// portal is on a different subdomain — cross-subdomain session carry-over is
// unreliable. Starting from an empty storage state and logging in inline on
// the packaging portal itself guarantees the session belongs to this test.
test.use({ storageState: { cookies: [], origins: [] } })

let recorderCounter = SCREENSHOT_START_AT

async function capture(page, label, side = 'regulator') {
  if (!EVIDENCE_DIR) return null
  recorderCounter += 1
  const dir = path.join(EVIDENCE_DIR, 'screenshots')
  await mkdir(dir, { recursive: true })
  const number = String(recorderCounter).padStart(3, '0')
  const slug = String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  const file = `${number}_${side}_${slug}.png`
  const target = path.join(dir, file)
  const buffer = await page.screenshot({ fullPage: true })
  await writeFile(target, buffer)
  await writeFile(target.replace(/\.png$/, '.txt'), `${label}\n`, 'utf8')
  return target
}

async function signInOnPackagingPortal(page) {
  const email = process.env[`TEST_EMAIL_NATION_${NATION_ID}`]
  const password = process.env[`TEST_PASSWORD_NATION_${NATION_ID}`]
  if (!email || !password) {
    throw new Error(
      `Regulator credentials missing: TEST_EMAIL_NATION_${NATION_ID} / TEST_PASSWORD_NATION_${NATION_ID}`
    )
  }
  const portalUrl = process.env.packagingRegulatorBaseURL
  await page.goto(`${portalUrl}`)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => !url.hostname.includes('b2clogin'))
}

test.describe(`Regulator CSoC ${JOURNEY ?? '<unset>'} · ${REGULATOR ?? '<unset>'} · ${ORG_TYPE ?? '<unset>'}`, () => {
  test.skip(
    !IS_HARNESS_RUN,
    'CSoC E2E harness env vars not set — this spec is skill-driven'
  )

  if (!IS_HARNESS_RUN) {
    test('placeholder', () => {})
    return
  }

  const orgTypeSegment =
    ORG_TYPE === 'CS' ? 'compliance-schemes' : 'direct-producers'

  test.beforeEach(async ({ page }) => {
    page.setDefaultNavigationTimeout(45_000)
  })

  switch (JOURNEY) {
    case 'E2E-01.1':
    case 'E2E-01.2':
    case 'E2E-01.3a':
    case 'E2E-01.3c':
      // E2E-01.3a / E2E-01.3c are the CS non-compliant variants (Reg 43
      // = NO). Regulator flow is still "log in, find the submission,
      // approve". The producer-side already handled the Reg 43 selection
      // and the obligation seed differs between variants (03a=MET,
      // 03c=NOT MET).
      runApprove(orgTypeSegment)
      break
    case 'E2E-04':
    case 'E2E-08':
      // Multi-phase: runner sequences approve / cancel / view-history calls.
      if (PHASE === 'approve') runApprove(orgTypeSegment)
      else if (PHASE === 'cancel') runCancel(orgTypeSegment)
      else if (PHASE === 'view-history') runViewHistory(orgTypeSegment)
      else
        throw new Error(
          `Unknown regulator PHASE "${PHASE}" for ${JOURNEY}. ` +
            'Expected: approve, cancel, view-history.'
        )
      break
    default:
      test.fixme(
        `${JOURNEY}: not implemented yet — regulator scaffold only`,
        () => {
          // See plans/given-this-is-the-purrfect-sutton.md for the sequence
          // each remaining journey needs on the regulator side.
        }
      )
      break
  }
})

function runApprove(orgTypeSegment) {
  test('Regulator finds the pending submission and approves it', async ({
    page
  }) => {
    const certificatesPage = new CertificatesPage(page)
    const detailPage = new CertificatesDetailPage(page)
    const acceptPage = new CertificatesAcceptPage(page)

    await test.step(`Signs in as ${REGULATOR_LABEL} on the packaging portal (fresh session)`, async () => {
      // No screenshot here: the post-login landing page returns the
      // platform's "SSL Sidecar - Bad Gateway" 502 in the test environment.
      // The next step navigates straight to the certificates list.
      await signInOnPackagingPortal(page)
    })

    await test.step('Opens the certificates list', async () => {
      await certificatesPage.openDirect()
      await capture(page, `${CAPTION_PREFIX} — certificates list`)
    })

    await test.step(`Opens the ${orgTypeSegment} pending tab`, async () => {
      await certificatesPage.openListTab(orgTypeSegment, 'pending')
      await capture(page, `${CAPTION_PREFIX} — ${orgTypeSegment} pending`)
    })

    await test.step('Searches for the org by orgId', async () => {
      await certificatesPage.search(ORG_ID)
      await expect(certificatesPage.searchResults).toBeVisible()
      await capture(page, `${CAPTION_PREFIX} — search results for org`)
    })

    await test.step('Opens the submission detail', async () => {
      // After a search the page renders the org row in BOTH the pending list
      // and the search-results table, so `firstTableRowLink` (a global locator)
      // matches two elements. Scope to #search-results.
      await certificatesPage.searchResultRows
        .first()
        .locator(':is(td, th)')
        .first()
        .locator('a')
        .click()
      await page.waitForURL(/\/certificates-of-compliance\//)
      await expect(detailPage.organisationNameHeading).toBeVisible()
      await capture(page, `${CAPTION_PREFIX} — submission detail`)
    })

    await test.step('Clicks Accept', async () => {
      const acceptButton = detailPage.acceptCertificateLink.or(
        detailPage.acceptStatementLink
      )
      await acceptButton.click()
      await capture(page, `${CAPTION_PREFIX} — accept confirmation prompt`)
    })

    await test.step('Confirms Yes and lands back on the detail page', async () => {
      await acceptPage.selectYes()
      await expect(
        detailPage.summaryRowTag('Submission status', 'Accepted')
      ).toBeVisible()
      await capture(page, `${CAPTION_PREFIX} — submission Accepted`)
    })

    await test.step(`Verifies the submission is now on the Accepted tab (${orgTypeSegment})`, async () => {
      // The org just moved from Pending → Accepted server-side. Navigate
      // to the Accepted tab, search for it again, and screenshot the row
      // so the evidence pack shows the state change end-to-end.
      await certificatesPage.openListTab(orgTypeSegment, 'accepted')
      await capture(page, `${CAPTION_PREFIX} — ${orgTypeSegment} accepted tab`)
      await certificatesPage.search(ORG_ID)
      await expect(certificatesPage.searchResults).toBeVisible()
      await expect(
        certificatesPage.searchResultRows.first(),
        'expected the just-accepted submission to appear in Accepted results'
      ).toBeVisible()
      await capture(
        page,
        `${CAPTION_PREFIX} — accepted tab search results for org`
      )
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────
// E2E-04 / E2E-08 regulator phases
// ─────────────────────────────────────────────────────────────────────────

// Shared preamble for every regulator phase: fresh sign-in on the packaging
// portal → open certificates list → switch to the correct orgTypeSegment
// tab → search by orgId → open the detail.
//
// The search field is scoped to whichever orgTypeSegment (direct-producers
// vs compliance-schemes) is currently active — searching for a CS org from
// the Direct producers tab returns 0 results. We land on the pending tab
// because search results themselves are not filtered by pending/accepted,
// only by orgTypeSegment.
async function signInAndOpenDetail(
  page,
  orgTypeSegment,
  certificatesPage,
  detailPage,
  phaseLabel
) {
  await test.step(`Signs in as ${REGULATOR_LABEL} on the packaging portal (fresh session)`, async () => {
    // No screenshot here: the post-login landing page returns the
    // platform's "SSL Sidecar - Bad Gateway" 502 in the test environment.
    // The next step navigates straight to the certificates list.
    await signInOnPackagingPortal(page)
  })

  await test.step('Opens the certificates list', async () => {
    await certificatesPage.openDirect()
    await capture(page, `${CAPTION_PREFIX} — ${phaseLabel} — certificates list`)
  })

  await test.step(`Switches to the ${orgTypeSegment} pending tab`, async () => {
    await certificatesPage.openListTab(orgTypeSegment, 'pending')
    await capture(
      page,
      `${CAPTION_PREFIX} — ${phaseLabel} — ${orgTypeSegment} pending`
    )
  })

  await test.step(`Searches for the org by orgId`, async () => {
    await certificatesPage.search(ORG_ID)
    await expect(certificatesPage.searchResults).toBeVisible()
    await capture(
      page,
      `${CAPTION_PREFIX} — ${phaseLabel} — search results for org`
    )
  })

  await test.step('Opens the submission detail', async () => {
    await certificatesPage.searchResultRows
      .first()
      .locator(':is(td, th)')
      .first()
      .locator('a')
      .click()
    await page.waitForURL(/\/certificates-of-compliance\//)
    await expect(detailPage.organisationNameHeading).toBeVisible()
    await capture(page, `${CAPTION_PREFIX} — ${phaseLabel} — submission detail`)
  })
}

function runCancel(orgTypeSegment) {
  test('Regulator cancels the submission with a reason', async ({ page }) => {
    const certificatesPage = new CertificatesPage(page)
    const detailPage = new CertificatesDetailPage(page)
    const reasonPage = new CertificatesCancelReasonPage(page)
    const checkPage = new CertificatesCancelCheckPage(page)

    await signInAndOpenDetail(
      page,
      orgTypeSegment,
      certificatesPage,
      detailPage,
      'cancel'
    )

    await test.step('Clicks Cancel', async () => {
      const cancelButton = detailPage.cancelCertificateButton.or(
        detailPage.cancelStatementButton
      )
      await cancelButton.click()
      await expect(reasonPage.reasonHeading).toBeVisible()
      await capture(page, `${CAPTION_PREFIX} — cancel — reason page`)
    })

    await test.step(`Selects reason "${CANCEL_REASON}"`, async () => {
      await reasonPage.selectReason(CANCEL_REASON)
      await expect(checkPage.confirmHeading).toBeVisible()
      await capture(page, `${CAPTION_PREFIX} — cancel — check page`)
    })

    await test.step('Confirms and sends the cancellation', async () => {
      await checkPage.confirmAndSend()
      await expect(
        detailPage.summaryRowTag('Submission status', 'Cancelled')
      ).toBeVisible()
      await capture(
        page,
        `${CAPTION_PREFIX} — cancel — detail post-cancel (status=Cancelled)`
      )
    })

    await test.step('Verifies the cancelled outcome summary', async () => {
      await detailPage.expectCancelledOutcomeSummary(CANCEL_REASON)
      await capture(page, `${CAPTION_PREFIX} — cancel — outcome summary`)
    })
  })
}

function runViewHistory(orgTypeSegment) {
  test('Regulator views the submission history (Current year table)', async ({
    page
  }) => {
    const certificatesPage = new CertificatesPage(page)
    const detailPage = new CertificatesDetailPage(page)

    await signInAndOpenDetail(
      page,
      orgTypeSegment,
      certificatesPage,
      detailPage,
      'view-history'
    )

    // EXPECTED_HISTORY_ACTIONS is a chronological CSV — first = oldest.
    // The FE splits records between the "Submission status" summary at
    // the top (the CURRENT record) and the "Current year" table below
    // (HISTORIC actioned records — Accepted / Cancelled). A Pending or
    // Submitted current-record does NOT appear in the Current year table.
    //
    // So we treat the last expected action as the current summary status
    // and everything before it as historic rows.
    const expectedActions = (
      process.env.EXPECTED_HISTORY_ACTIONS || 'Cancelled,Submitted'
    )
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
    const currentAction = expectedActions[expectedActions.length - 1]
    const historicActions = expectedActions.slice(0, -1)

    // FE renders an internal "Submitted" status as "Pending" in the
    // summary tag (regulator hasn't actioned yet). Accept either.
    const currentTagRegex =
      currentAction === 'Submitted' ? /^(Submitted|Pending)$/ : currentAction

    await test.step(`Verifies current Submission status = "${currentAction}"`, async () => {
      await expect(
        detailPage.summaryRowTag('Submission status', currentTagRegex),
        `expected current Submission status to match "${currentAction}" (accepts "Pending" for Submitted)`
      ).toBeVisible()
    })

    if (historicActions.length > 0) {
      await test.step('Scrolls to the Current year history section', async () => {
        await expect(detailPage.currentYearHeading).toBeVisible()
        await expect(detailPage.currentYearTable).toBeVisible()
        await capture(page, `${CAPTION_PREFIX} — history — Current year table`)
      })

      for (const action of historicActions) {
        // eslint-disable-next-line no-await-in-loop
        await test.step(`Verifies historic "${action}" record is present`, async () => {
          const row = detailPage.currentYearRowWithAction(action).first()
          await expect(
            row,
            `expected the Current year history to include a "${action}" row`
          ).toBeVisible()
        })
      }
    } else {
      await capture(
        page,
        `${CAPTION_PREFIX} — history — no historic rows expected`
      )
    }

    await capture(
      page,
      `${CAPTION_PREFIX} — history — verified: ${expectedActions.join(' → ')} (current=${currentAction}, historic=[${historicActions.join(', ')}])`
    )
  })
}
