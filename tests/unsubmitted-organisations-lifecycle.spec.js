import { test, expect, request as apiRequest } from '@playwright/test'
import {
  searchUnsubmitted,
  createDeclaration,
  isOrgListedUnsubmitted,
  cancelActiveDeclarations,
  resolveLiveOrg,
  waitFor
} from '../utils/unsubmitted-orgs-api.js'
import { setDeclarationStatus } from '../utils/waste-obligations-api.js'
import { DECLARATION_STATUS } from '../data/csoc.data.js'
import { transcriptRecorderFromEnv } from '../utils/transcript-recorder.js'
import { DP_ORGS, CSO_ORGS } from '../data/unsubmitted-orgs-test-data.js'

// Lifecycle spec — for each known DP+CSO org (8 total), verifies the
// unsubmitted endpoint reflects each state transition:
//
//   1. Reset:  cancel any Submitted/Accepted declarations   → present
//   2. Submit: create declaration via POST                  → absent
//   3. Cancel: PATCH to Cancelled                           → present (again)
//   4. Submit: create a NEW declaration                     → absent
//   5. Accept: PATCH to Accepted                            → absent (still)
//   6. Cleanup: cancel any active declarations              → present
//
// The endpoint's exclusion contract is: filter out any org with a
// Submitted or Accepted declaration for the (org, year, registrationType).
// So (1)/(3)/(6) should list the org, (2)/(4)/(5) should not.
//
// Reset/cleanup use PATCH-to-Cancelled rather than the admin DELETE route
// — DELETE requires JOURNEY_USER credentials and isn't available through
// the CDP protected gateway. A Cancelled declaration doesn't block the
// filter, so it's functionally equivalent to deletion for our purposes.
//
// Uses waitFor() around each check to bridge any eventual-consistency lag
// between the write and the endpoint's next read. Default 30s should be
// generous — the filter is over the same Mongo the writes hit.

const EVIDENCE_DIR = process.env.EVIDENCE_DIR
const IS_HARNESS_RUN = Boolean(EVIDENCE_DIR)
const CURRENT_YEAR =
  Number(process.env.OBLIGATION_YEAR) || new Date().getFullYear()

const ALL_ORGS = [...Object.values(DP_ORGS), ...Object.values(CSO_ORGS)]

let apiContext
let transcripts

test.describe('Unsubmitted Organisations — lifecycle (submit / cancel / accept)', () => {
  test.skip(
    !IS_HARNESS_RUN,
    'EVIDENCE_DIR not set — driven by .claude/skills/unsubmitted-orgs/runner.mjs'
  )

  if (!IS_HARNESS_RUN) {
    test('placeholder', () => {})
    return
  }

  // NOT serial: each org's lifecycle is a self-contained test with ordered
  // steps inside — orgs are independent, so a failure on one shouldn't
  // block the other 7. (Playwright's workers: 1 still runs them one at a
  // time; serial just cascades cancellations, which we don't want.)

  test.beforeAll(async () => {
    transcripts = await transcriptRecorderFromEnv()
  })

  test.beforeEach(async () => {
    apiContext = await apiRequest.newContext({ ignoreHTTPSErrors: true })
  })

  test.afterEach(async () => {
    await apiContext?.dispose()
  })

  for (const seedOrg of ALL_ORGS) {
    test(`lifecycle: ${seedOrg.registrationType} · ${seedOrg.country} · ref ${seedOrg.referenceNumber}`, async () => {
      test.setTimeout(300_000) // 5 minutes per org — polling headroom

      // Resolve the org's LIVE organisationId from the search endpoint at
      // test start. Test-data GUIDs drift between tst refreshes, but the
      // reference number is stable (it's the polled data key). If the org
      // isn't currently in the unsubmitted list, first try to clear any
      // active declaration via the hardcoded id, then re-resolve.
      let org = seedOrg
      await test.step('0. resolve live organisationId by reference number', async () => {
        try {
          await cancelActiveDeclarations(apiContext, seedOrg.organisationId, {
            year: CURRENT_YEAR
          })
        } catch (err) {
          // Ignore — the seed id may be stale; the resolve below is what matters.
        }
        const resolved = await resolveLiveOrg(apiContext, seedOrg, {
          year: CURRENT_YEAR
        })
        if (!resolved) {
          throw new Error(
            `Could not resolve live orgId for ${seedOrg.registrationType} ${seedOrg.country} ref ${seedOrg.referenceNumber} — org not currently in unsubmitted list. Test data may be stale, or the org has an unresettable Accepted declaration.`
          )
        }
        if (resolved.organisationId !== seedOrg.organisationId) {
          // eslint-disable-next-line no-console
          console.warn(
            `[lifecycle] test-data drift: ${seedOrg.registrationType} ${seedOrg.country} ref ${seedOrg.referenceNumber} — using resolved orgId ${resolved.organisationId} (test-data said ${seedOrg.organisationId})`
          )
        }
        org = resolved
      })

      // ── 1. Reset: cancel any active declarations, expect org to be listed ──
      await test.step('1. reset year state → org appears as unsubmitted', async () => {
        await cancelActiveDeclarations(apiContext, org.organisationId, {
          year: CURRENT_YEAR
        })
        await waitFor(
          () => isOrgListedUnsubmitted(apiContext, org, { year: CURRENT_YEAR }),
          {
            label: `post-reset present: ${org.referenceNumber}`,
            timeoutMs: 30_000
          }
        )
        const { url, response, body } = await searchUnsubmitted(apiContext, {
          obligationYear: CURRENT_YEAR,
          search: org.referenceNumber,
          pageSize: 10
        })
        await transcripts.record(
          `Lifecycle ${org.country}/${org.registrationType} — step 1 reset (present)`,
          {
            request: { method: 'GET', url, headers: {} },
            response,
            responseBody: JSON.stringify(body, null, 2)
          }
        )
      })

      // ── 2. Submit: create declaration, expect org to disappear ──
      let firstDeclarationId
      await test.step('2. create declaration → org disappears from unsubmitted', async () => {
        const created = await createDeclaration(apiContext, org, {
          year: CURRENT_YEAR
        })
        firstDeclarationId = created.id
        await waitFor(
          async () =>
            !(await isOrgListedUnsubmitted(apiContext, org, {
              year: CURRENT_YEAR
            })),
          {
            label: `post-submit absent: ${org.referenceNumber}`,
            timeoutMs: 30_000
          }
        )
        const { url, response, body } = await searchUnsubmitted(apiContext, {
          obligationYear: CURRENT_YEAR,
          search: org.referenceNumber,
          pageSize: 10
        })
        await transcripts.record(
          `Lifecycle ${org.country}/${org.registrationType} — step 2 submitted (absent)`,
          {
            request: { method: 'GET', url, headers: {} },
            response,
            responseBody: JSON.stringify(
              {
                createdDeclarationId: firstDeclarationId,
                search: body
              },
              null,
              2
            )
          }
        )
        expect(
          body.unsubmittedOrganisations.find(
            (r) => r.referenceNumber === org.referenceNumber
          ),
          `expected ${org.referenceNumber} to be absent after Submit`
        ).toBeUndefined()
      })

      // ── 3. Cancel: PATCH to Cancelled, expect org to reappear ──
      await test.step('3. cancel declaration → org reappears as unsubmitted', async () => {
        await setDeclarationStatus(
          apiContext,
          org.organisationId,
          firstDeclarationId,
          DECLARATION_STATUS.Cancelled,
          'Lifecycle-test cancel'
        )
        await waitFor(
          () => isOrgListedUnsubmitted(apiContext, org, { year: CURRENT_YEAR }),
          {
            label: `post-cancel present: ${org.referenceNumber}`,
            timeoutMs: 30_000
          }
        )
        const { url, response, body } = await searchUnsubmitted(apiContext, {
          obligationYear: CURRENT_YEAR,
          search: org.referenceNumber,
          pageSize: 10
        })
        await transcripts.record(
          `Lifecycle ${org.country}/${org.registrationType} — step 3 cancelled (present again)`,
          {
            request: { method: 'GET', url, headers: {} },
            response,
            responseBody: JSON.stringify(body, null, 2)
          }
        )
        expect(
          body.unsubmittedOrganisations.find(
            (r) => r.referenceNumber === org.referenceNumber
          ),
          `expected ${org.referenceNumber} to reappear after Cancel`
        ).toBeDefined()
      })

      // ── 4+5. Create fresh, Accept, expect terminal absence ──
      let secondDeclarationId
      await test.step('4-5. new declaration → accept → org stays absent', async () => {
        const created = await createDeclaration(apiContext, org, {
          year: CURRENT_YEAR
        })
        secondDeclarationId = created.id
        await setDeclarationStatus(
          apiContext,
          org.organisationId,
          secondDeclarationId,
          DECLARATION_STATUS.Accepted
        )
        await waitFor(
          async () =>
            !(await isOrgListedUnsubmitted(apiContext, org, {
              year: CURRENT_YEAR
            })),
          {
            label: `post-accept absent: ${org.referenceNumber}`,
            timeoutMs: 30_000
          }
        )
        const { url, response, body } = await searchUnsubmitted(apiContext, {
          obligationYear: CURRENT_YEAR,
          search: org.referenceNumber,
          pageSize: 10
        })
        await transcripts.record(
          `Lifecycle ${org.country}/${org.registrationType} — step 4-5 accepted (absent)`,
          {
            request: { method: 'GET', url, headers: {} },
            response,
            responseBody: JSON.stringify(
              {
                secondDeclarationId,
                search: body
              },
              null,
              2
            )
          }
        )
        expect(
          body.unsubmittedOrganisations.find(
            (r) => r.referenceNumber === org.referenceNumber
          ),
          `expected ${org.referenceNumber} to be absent after Accept`
        ).toBeUndefined()
      })

      // ── 6. Cleanup: cancel everything so a re-run starts clean ──
      await test.step('6. cleanup: cancel active declarations → org reappears', async () => {
        await cancelActiveDeclarations(apiContext, org.organisationId, {
          year: CURRENT_YEAR
        })
        await waitFor(
          () => isOrgListedUnsubmitted(apiContext, org, { year: CURRENT_YEAR }),
          {
            label: `post-cleanup present: ${org.referenceNumber}`,
            timeoutMs: 30_000
          }
        )
      })
    })
  }
})
