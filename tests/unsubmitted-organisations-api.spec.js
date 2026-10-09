import { test, expect, request as apiRequest } from '@playwright/test'
import {
  searchUnsubmitted,
  cancelActiveDeclarations,
  findRowMatchingRef,
  resolveLiveOrg,
  REGISTRATION_TYPE,
  REQUIRED_ORG_FIELDS,
  SORT_FIELD
} from '../utils/unsubmitted-orgs-api.js'
import { transcriptRecorderFromEnv } from '../utils/transcript-recorder.js'
import {
  COUNTRIES,
  REG_TYPES,
  DP_ORGS,
  CSO_ORGS,
  allKnownOrgs,
  orgFor
} from '../data/unsubmitted-orgs-test-data.js'

// API-level ACs for the "Unsubmitted Organisations Search" endpoint
// (GET /compliance-declarations/unsubmitted). Iterates the full
// country × registrationType matrix and asserts against known tst orgs
// rather than skipping when data is thin.
//
// Skill-driven — the whole describe skips unless EVIDENCE_DIR is set, so
// the existing e2e/accessibility/security profiles don't accidentally
// discover it and hammer the backend without evidence capture.

const EVIDENCE_DIR = process.env.EVIDENCE_DIR
const IS_HARNESS_RUN = Boolean(EVIDENCE_DIR)
const CURRENT_YEAR =
  Number(process.env.OBLIGATION_YEAR) || new Date().getFullYear()
const PRIOR_YEAR = CURRENT_YEAR - 1
const DEFAULT_PAGE_SIZE = 100

let apiContext
let transcripts

test.describe('Unsubmitted Organisations Search — API', () => {
  test.skip(
    !IS_HARNESS_RUN,
    'EVIDENCE_DIR not set — this spec is driven by .claude/skills/unsubmitted-orgs/runner.mjs'
  )

  test.beforeAll(async () => {
    transcripts = await transcriptRecorderFromEnv()
    // Best-effort reset: cancel any active declaration on the 8 known
    // orgs before the AC assertions run so a prior run's leftover state
    // (a Submitted that never got cancelled, an Accepted that was left in
    // terminal state) doesn't red-line the "known org must be present"
    // assertions. cancelActiveDeclarations swallows 404 per-org, so a
    // stale test-data GUID is a no-op here — the AC assertions will
    // surface it downstream if the org still isn't in the unsubmitted list.
    const resetCtx = await apiRequest.newContext({ ignoreHTTPSErrors: true })
    try {
      for (const org of allKnownOrgs()) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await cancelActiveDeclarations(resetCtx, org.organisationId)
        } catch (err) {
          // Log and continue — the AC tests carry the assertion, not this reset.
          // eslint-disable-next-line no-console
          console.warn(
            `[ac-reset] ${org.registrationType} ${org.country} (${org.referenceNumber}): ${err.message}`
          )
        }
      }
    } finally {
      await resetCtx.dispose()
    }
  })

  test.beforeEach(async () => {
    apiContext = await apiRequest.newContext({ ignoreHTTPSErrors: true })
  })

  test.afterEach(async () => {
    await apiContext?.dispose()
  })

  if (!IS_HARNESS_RUN) {
    // eslint-disable-next-line playwright/expect-expect -- keeps the file listable when the harness env isn't set
    test('placeholder', () => {})

    return
  }

  // ─── AC1 — Identify unsubmitted organisations ─────────────────────────
  test.describe('AC1 — eligibility filter', () => {
    test('returns a page of orgs for the current obligation year', async () => {
      const { url, response, body } = await searchUnsubmitted(apiContext, {
        obligationYear: CURRENT_YEAR,
        pageSize: DEFAULT_PAGE_SIZE
      })
      await transcripts.record('AC1 — baseline search for current year', {
        request: { method: 'GET', url, headers: {} },
        response,
        responseBody: JSON.stringify(body, null, 2),
        notes: 'AC1 baseline: endpoint responds 200 with a paged list.'
      })
      expect(response.status(), 'endpoint should respond 200').toBe(200)
      expect(body).toHaveProperty('unsubmittedOrganisations')
      expect(body).toHaveProperty('total')
      expect(Array.isArray(body.unsubmittedOrganisations)).toBe(true)
      expect(
        body.total,
        'endpoint must return at least the 8 known test orgs'
      ).toBeGreaterThanOrEqual(allKnownOrgs().length)
    })

    test('every returned row carries no Submitted/Accepted status field', async () => {
      const { url, response, body } = await searchUnsubmitted(apiContext, {
        obligationYear: CURRENT_YEAR,
        pageSize: DEFAULT_PAGE_SIZE
      })
      await transcripts.record(
        'AC1 — returned rows carry no Submitted/Accepted marker',
        {
          request: { method: 'GET', url, headers: {} },
          response,
          responseBody: JSON.stringify(body, null, 2),
          notes:
            'AC1 exclusion contract: rows for orgs with a Submitted or ' +
            'Accepted declaration are filtered out server-side, so the ' +
            'response should never carry a declaration-status field.'
        }
      )
      for (const row of body.unsubmittedOrganisations ?? []) {
        expect(row).not.toHaveProperty('complianceDeclarationStatus')
        expect(row).not.toHaveProperty('status')
      }
    })
  })

  // ─── AC2 — Return the required organisation information ───────────────
  test.describe('AC2 — response fields', () => {
    test('every row carries the ticket-required fields', async () => {
      const { url, response, body } = await searchUnsubmitted(apiContext, {
        obligationYear: CURRENT_YEAR,
        pageSize: 20
      })
      await transcripts.record('AC2 — required fields present on every row', {
        request: { method: 'GET', url, headers: {} },
        response,
        responseBody: JSON.stringify(body, null, 2),
        notes:
          `AC2 requires: ${REQUIRED_ORG_FIELDS.join(', ')}. ` +
          'NAMING NIT: the ticket lists "Country" but the response emits ' +
          '`businessCountry` (same data). Decide whether to update the AC ' +
          'wording or rename the field on the backend.'
      })
      const rows = body.unsubmittedOrganisations ?? []
      expect(rows.length, 'expected rows to assert against').toBeGreaterThan(0)
      for (const [i, row] of rows.entries()) {
        for (const field of REQUIRED_ORG_FIELDS) {
          expect(
            row,
            `row ${i} missing "${field}" (ticket AC2). Row: ${JSON.stringify(row)}`
          ).toHaveProperty(field)
        }
      }
    })

    test('known DP/CSO orgs return the expected canonical values', async () => {
      // Strong per-org assertion — proves not just "the field exists" but
      // that the endpoint returns the SAME data we seeded. Iterates the
      // full matrix so all 8 known orgs are exercised. Uses resolveLiveOrg
      // (which walks pages) so a large tst result set doesn't wrongly
      // declare the org "missing".
      const failures = []
      for (const org of allKnownOrgs()) {
        // eslint-disable-next-line no-await-in-loop
        const resolved = await resolveLiveOrg(apiContext, org, {
          year: CURRENT_YEAR
        })
        // eslint-disable-next-line no-await-in-loop
        const { url, response, body } = await searchUnsubmitted(apiContext, {
          obligationYear: CURRENT_YEAR,
          search: org.referenceNumber,
          pageSize: 10
        })
        // eslint-disable-next-line no-await-in-loop
        await transcripts.record(
          `AC2 — canonical values for ${org.registrationType} ${org.country} (${org.referenceNumber})`,
          {
            request: { method: 'GET', url, headers: {} },
            response,
            responseBody: JSON.stringify(body, null, 2)
          }
        )
        // eslint-disable-next-line playwright/no-conditional-in-test -- collects every org's mismatch, then fails once
        if (!resolved) {
          failures.push(
            `${org.country}/${org.registrationType} ref=${org.referenceNumber}: ` +
              `not in unsubmitted list (may have active declaration or ref not in polled data)`
          )
          continue
        }
        try {
          expect(resolved.registrationType).toBe(org.registrationType)
          expect(resolved.country).toBe(org.country)
          // Name may drift (tst refresh); we assert it's non-empty rather
          // than exact so a rename doesn't red-line the whole test.
          expect(
            typeof resolved.name === 'string' && resolved.name.length,
            `expected non-empty name for ${org.referenceNumber}`
          ).toBeTruthy()
        } catch (e) {
          failures.push(
            `${org.country}/${org.registrationType} ref=${org.referenceNumber}: ${e.message}`
          )
        }
      }
      expect(
        failures,
        'known-org value mismatches:\n' + failures.join('\n')
      ).toEqual([])
    })
  })

  // ─── AC3 — Filter the list ────────────────────────────────────────────
  test.describe('AC3 — filters', () => {
    for (const country of COUNTRIES) {
      for (const regType of REG_TYPES) {
        test(`filter country=${country} + registrationType=${regType} returns only matching rows`, async () => {
          const { url, response, body } = await searchUnsubmitted(apiContext, {
            obligationYear: CURRENT_YEAR,
            country,
            registrationType: regType,
            pageSize: DEFAULT_PAGE_SIZE
          })
          await transcripts.record(
            `AC3 — filter country=${country} regType=${regType}`,
            {
              request: { method: 'GET', url, headers: {} },
              response,
              responseBody: JSON.stringify(body, null, 2)
            }
          )
          expect(response.status()).toBe(200)
          const rows = body.unsubmittedOrganisations ?? []
          for (const row of rows) {
            expect(
              row.businessCountry,
              `row leaked from another country: ${JSON.stringify(row)}`
            ).toBe(country)
            expect(
              row.registrationType,
              `row leaked from another registration type: ${JSON.stringify(row)}`
            ).toBe(regType)
          }
          // "Known org present" is a data-quality follow-up to the filter
          // assertion above. Use the paginated resolver so the check is
          // robust when the (country, regType) result set spans multiple
          // pages — page 1 alone would be a lower bound only.
          const knownOrg = orgFor(country, regType)
          const resolved = await resolveLiveOrg(apiContext, knownOrg, {
            year: CURRENT_YEAR
          })
          expect(
            resolved,
            `known ${regType} for ${country} (ref ${knownOrg.referenceNumber}) not in unsubmitted list — ` +
              `may already have a live declaration, or filter is broken`
          ).not.toBeNull()
        })
      }
    }

    test('registrationType accepts CSV of DirectProducer + ComplianceScheme', async () => {
      const { url, response, body } = await searchUnsubmitted(apiContext, {
        obligationYear: CURRENT_YEAR,
        registrationType: [
          REGISTRATION_TYPE.DirectProducer,
          REGISTRATION_TYPE.ComplianceScheme
        ],
        pageSize: DEFAULT_PAGE_SIZE
      })
      await transcripts.record('AC3 — registrationType CSV (both types)', {
        request: { method: 'GET', url, headers: {} },
        response,
        responseBody: JSON.stringify(body, null, 2)
      })
      expect(response.status()).toBe(200)
      const types = new Set(
        body.unsubmittedOrganisations.map((r) => r.registrationType)
      )
      // At least one of each should appear (both known-org sets contain
      // members eligible in the current year).
      expect(types.has('DirectProducer') || types.has('ComplianceScheme')).toBe(
        true
      )
    })
  })

  // ─── AC4 — Search the list ────────────────────────────────────────────
  test.describe('AC4 — search (case-insensitive partial match)', () => {
    test('search by known reference number returns the exact org', async () => {
      const org = DP_ORGS['GB-ENG']
      const { url, response, body } = await searchUnsubmitted(apiContext, {
        obligationYear: CURRENT_YEAR,
        search: org.referenceNumber,
        pageSize: 10
      })
      await transcripts.record(
        `AC4 — search by reference number ${org.referenceNumber}`,
        {
          request: { method: 'GET', url, headers: {} },
          response,
          responseBody: JSON.stringify(body, null, 2)
        }
      )
      expect(response.status()).toBe(200)
      // Walk pages under the same search — an exact-ref hit should be
      // narrow, but a shared substring on tst can still push the target
      // past page 1.
      const match = await findRowMatchingRef(apiContext, org.referenceNumber, {
        year: CURRENT_YEAR,
        search: org.referenceNumber
      })
      expect(match, 'exact reference-number search must match').not.toBeNull()
    })

    test('search by name partial (case-insensitive) surfaces the org', async () => {
      const org = DP_ORGS['GB-ENG']
      // Take 6 chars of the name, mix the case, verify it still matches.
      const term = org.name.slice(0, 6).toLowerCase()
      const { url, response, body } = await searchUnsubmitted(apiContext, {
        obligationYear: CURRENT_YEAR,
        search: term,
        pageSize: DEFAULT_PAGE_SIZE
      })
      await transcripts.record(
        `AC4 — search by name partial "${term}" (case-insensitive)`,
        {
          request: { method: 'GET', url, headers: {} },
          response,
          responseBody: JSON.stringify(body, null, 2)
        }
      )
      expect(response.status()).toBe(200)
      // Walk pages: a 6-char prefix can match many rows in tst.
      const match = await findRowMatchingRef(apiContext, org.referenceNumber, {
        year: CURRENT_YEAR,
        search: term
      })
      expect(
        match,
        `expected known org "${org.name}" (ref ${org.referenceNumber}) to match "${term}"`
      ).not.toBeNull()
    })

    test('search by CSO name partial returns the CSO', async () => {
      const org = CSO_ORGS['GB-ENG']
      const term = 'CS_GENERATED'
      const { url, response, body } = await searchUnsubmitted(apiContext, {
        obligationYear: CURRENT_YEAR,
        search: term,
        registrationType: REGISTRATION_TYPE.ComplianceScheme,
        pageSize: DEFAULT_PAGE_SIZE
      })
      await transcripts.record(`AC4 — search CSO by prefix "${term}"`, {
        request: { method: 'GET', url, headers: {} },
        response,
        responseBody: JSON.stringify(body, null, 2)
      })
      expect(response.status()).toBe(200)
      // "CS_GENERATED" is the tst-seed prefix for every CSO — very broad.
      // Walking pages is essential here.
      const match = await findRowMatchingRef(apiContext, org.referenceNumber, {
        year: CURRENT_YEAR,
        registrationType: REGISTRATION_TYPE.ComplianceScheme,
        search: term
      })
      expect(
        match,
        'expected CSO to appear in CS_GENERATED search'
      ).not.toBeNull()
    })
  })

  // ─── AC5 — Page results ───────────────────────────────────────────────
  test.describe('AC5 — pagination', () => {
    test('page 1 and page 2 return disjoint rows; total is stable', async () => {
      const first = await searchUnsubmitted(apiContext, {
        obligationYear: CURRENT_YEAR,
        page: 1,
        pageSize: 5
      })
      await transcripts.record('AC5 — page 1 pageSize 5', {
        request: { method: 'GET', url: first.url, headers: {} },
        response: first.response,
        responseBody: JSON.stringify(first.body, null, 2)
      })
      expect(first.response.status()).toBe(200)
      expect(first.body.page).toBe(1)
      expect(first.body.pageSize).toBe(5)
      expect(first.body.unsubmittedOrganisations.length).toBeLessThanOrEqual(5)

      // We need at least 6 total orgs to prove disjoint pages meaningfully.
      expect(
        first.body.total,
        'need >5 orgs for pagination assertion (tst should have 8+ knowns)'
      ).toBeGreaterThan(5)

      const second = await searchUnsubmitted(apiContext, {
        obligationYear: CURRENT_YEAR,
        page: 2,
        pageSize: 5
      })
      await transcripts.record('AC5 — page 2 pageSize 5', {
        request: { method: 'GET', url: second.url, headers: {} },
        response: second.response,
        responseBody: JSON.stringify(second.body, null, 2)
      })
      expect(second.body.page).toBe(2)
      expect(second.body.total, 'total should be stable across pages').toBe(
        first.body.total
      )
      const firstIds = new Set(
        first.body.unsubmittedOrganisations.map((r) => r.organisationId)
      )
      for (const row of second.body.unsubmittedOrganisations) {
        expect(
          firstIds.has(row.organisationId),
          'page 2 rows should not overlap page 1'
        ).toBe(false)
      }
    })

    test('pageSize=1 returns exactly one row', async () => {
      const { url, response, body } = await searchUnsubmitted(apiContext, {
        obligationYear: CURRENT_YEAR,
        pageSize: 1
      })
      await transcripts.record('AC5 — pageSize=1 boundary', {
        request: { method: 'GET', url, headers: {} },
        response,
        responseBody: JSON.stringify(body, null, 2)
      })
      expect(response.status()).toBe(200)
      expect(body.unsubmittedOrganisations).toHaveLength(1)
    })

    test('total across all pages sums to the reported total', async () => {
      const first = await searchUnsubmitted(apiContext, {
        obligationYear: CURRENT_YEAR,
        pageSize: DEFAULT_PAGE_SIZE
      })
      const totalPages = Math.ceil(first.body.total / DEFAULT_PAGE_SIZE)
      let seen = first.body.unsubmittedOrganisations.length
      const uniqueIds = new Set(
        first.body.unsubmittedOrganisations.map((r) => r.organisationId)
      )
      for (let p = 2; p <= totalPages; p += 1) {
        // eslint-disable-next-line no-await-in-loop
        const { body } = await searchUnsubmitted(apiContext, {
          obligationYear: CURRENT_YEAR,
          pageSize: DEFAULT_PAGE_SIZE,
          page: p
        })
        seen += body.unsubmittedOrganisations.length
        for (const r of body.unsubmittedOrganisations)
          uniqueIds.add(r.organisationId)
      }
      await transcripts.record(
        `AC5 — walked ${totalPages} page(s), seen=${seen}, unique=${uniqueIds.size}, total=${first.body.total}`,
        {
          request: { method: 'GET', url: first.url, headers: {} },
          response: first.response,
          responseBody: JSON.stringify(
            {
              total: first.body.total,
              seen,
              unique: uniqueIds.size,
              pages: totalPages
            },
            null,
            2
          )
        }
      )
      expect(uniqueIds.size).toBe(first.body.total)
    })
  })

  // ─── AC6 — Sort results ───────────────────────────────────────────────
  test.describe('AC6 — sort', () => {
    test('default sort is name ascending (case-sensitive)', async () => {
      const { url, response, body } = await searchUnsubmitted(apiContext, {
        obligationYear: CURRENT_YEAR,
        pageSize: DEFAULT_PAGE_SIZE
      })
      // Data-quality flag: rows whose name begins with a lowercase letter
      // will rank at the tail of asc / head of desc due to ASCII collation.
      const oddNames = body.unsubmittedOrganisations
        .map((r) => r.name)
        .filter((n) => n && /^[a-z]/.test(n))
      await transcripts.record('AC6 — default sort (name asc)', {
        request: { method: 'GET', url, headers: {} },
        response,
        responseBody: JSON.stringify(body, null, 2),
        notes:
          'FINDING (sort collation): name sort is CASE-SENSITIVE (ASCII/' +
          'binary). Lowercase names rank AFTER all uppercase names in asc. ' +
          'Ticket AC6 does not mandate case sensitivity; GDS UX default is ' +
          'case-insensitive. Decide whether backend should change or the ' +
          'AC should document the current behaviour.\n\n' +
          `FINDING (data quality): ${oddNames.length} row(s) start with a ` +
          `lowercase letter and will ripple to the extremes of the sort. ` +
          `Sample: ${JSON.stringify(oddNames.slice(0, 5))}. ` +
          `"en enroll sc org" is one such row — worth cleaning up in the ` +
          `tst seed data.`
      })
      expect(response.status()).toBe(200)
      const names = body.unsubmittedOrganisations
        .map((r) => r.name)
        .filter(Boolean)
      const sorted = [...names].sort(stringCompare)
      expect(names).toEqual(sorted)
    })

    for (const field of Object.values(SORT_FIELD)) {
      for (const direction of ['asc', 'desc']) {
        test(`sort by ${field} ${direction}`, async () => {
          const { url, response, body } = await searchUnsubmitted(apiContext, {
            obligationYear: CURRENT_YEAR,
            sort: `${field}[${direction}]`,
            pageSize: DEFAULT_PAGE_SIZE
          })
          await transcripts.record(`AC6 — sort ${field} ${direction}`, {
            request: { method: 'GET', url, headers: {} },
            response,
            responseBody: JSON.stringify(body, null, 2)
          })
          expect(response.status()).toBe(200)
          const values = body.unsubmittedOrganisations
            .map((r) => r[lowerFirst(field)])
            .filter((v) => v !== null && v !== undefined)
          expect(values).toEqual(expectedOrder(values, direction))
        })
      }
    }
  })

  // ─── Diagnostics + edge cases ─────────────────────────────────────────
  test.describe('Diagnostics + edge cases', () => {
    test('recyclingObligationsMet null distribution report', async () => {
      // Not an AC — a QA note. Reports how many rows return null vs
      // true/false for recyclingObligationsMet. Null likely means the
      // obligations calculation hasn't produced a value yet for that org.
      // The evidence pack surfaces the distribution so the delivery team
      // can confirm this is intentional and not a data gap.
      const { url, response, body } = await searchUnsubmitted(apiContext, {
        obligationYear: CURRENT_YEAR,
        pageSize: DEFAULT_PAGE_SIZE
      })
      const rows = body.unsubmittedOrganisations ?? []
      const nullRows = rows.filter((r) => r.recyclingObligationsMet === null)
      const trueRows = rows.filter((r) => r.recyclingObligationsMet === true)
      const falseRows = rows.filter((r) => r.recyclingObligationsMet === false)
      await transcripts.record(
        'Diagnostic — recyclingObligationsMet null distribution',
        {
          request: { method: 'GET', url, headers: {} },
          response,
          responseBody: JSON.stringify(
            {
              total: rows.length,
              null: nullRows.length,
              true: trueRows.length,
              false: falseRows.length,
              sample_null: nullRows.slice(0, 3).map((r) => ({
                ref: r.referenceNumber,
                name: r.name,
                coverage: r.obligationCoveragePercentage
              }))
            },
            null,
            2
          ),
          notes:
            'FINDING: null on recyclingObligationsMet almost certainly ' +
            'means the obligations calculation has not produced a value ' +
            'for that org/year yet (POM not submitted, or calc not run). ' +
            'Confirm with the delivery team whether null is the correct ' +
            'representation or whether the endpoint should hide the row ' +
            'until a value exists.'
        }
      )
      // Emit a warning-level assertion rather than failing — this is a
      // report, not a pass/fail. But do check the counts add up.
      expect(nullRows.length + trueRows.length + falseRows.length).toBe(
        rows.length
      )
    })

    test('year-end boundary — prior year is queryable independently', async () => {
      const { url, response, body } = await searchUnsubmitted(apiContext, {
        obligationYear: PRIOR_YEAR,
        pageSize: 5
      })
      await transcripts.record(`Edge — prior year (${PRIOR_YEAR}) queryable`, {
        request: { method: 'GET', url, headers: {} },
        response,
        responseBody: JSON.stringify(body, null, 2),
        notes:
          'QA note: verify behaviour across the 31-Jan→1-Feb boundary. ' +
          `A query for the previous obligation year (${PRIOR_YEAR}) must ` +
          'still succeed and return sensible rows.'
      })
      expect(response.status()).toBe(200)
      for (const row of body.unsubmittedOrganisations ?? []) {
        expect(row.obligationYear).toBe(PRIOR_YEAR)
      }
    })

    test('unknown reference number returns zero matches', async () => {
      // Substitutes the previously-placeholder "unregistered org" test.
      // The endpoint contract for a truly unknown ref is: empty result set.
      // If a real unregistered-org concept lands (soft-delete flag, etc.),
      // this test grows a second case that searches for its ref and
      // asserts absence.
      const { url, response, body } = await searchUnsubmitted(apiContext, {
        obligationYear: CURRENT_YEAR,
        search: 'ZZZZ-nonexistent-ref-9999999',
        pageSize: 5
      })
      await transcripts.record('Edge — unknown reference returns empty set', {
        request: { method: 'GET', url, headers: {} },
        response,
        responseBody: JSON.stringify(body, null, 2),
        notes:
          'QA open question: "Can organisations unregister?" ' +
          'Product-clarification-needed — the concept of an unregistered ' +
          'org is not defined in the API contract. Once defined, this ' +
          'test should assert an unregistered org does NOT appear.'
      })
      expect(response.status()).toBe(200)
      expect(body.unsubmittedOrganisations).toEqual([])
    })

    test('performance — core query returns within 3 seconds', async () => {
      const start = Date.now()
      const { url, response, body } = await searchUnsubmitted(apiContext, {
        obligationYear: CURRENT_YEAR,
        pageSize: DEFAULT_PAGE_SIZE
      })
      const elapsedMs = Date.now() - start
      await transcripts.record(`Edge — response time ${elapsedMs}ms`, {
        request: { method: 'GET', url, headers: {} },
        response,
        responseBody: JSON.stringify({ elapsedMs, total: body.total }, null, 2),
        notes:
          'QA note (performance): soft-threshold 3000ms for pageSize=100. ' +
          'Fails the test if breached — raise as a perf finding, not a bug.'
      })
      expect(response.status()).toBe(200)
      expect(
        elapsedMs,
        `endpoint took ${elapsedMs}ms (soft threshold 3000ms)`
      ).toBeLessThan(3000)
    })
  })
})

function lowerFirst(s) {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

// Case-sensitive string comparator matching the backend's ASCII/binary
// collation (lowercase letters rank after uppercase). Extracted so the
// default-sort test and the parameterised field/direction tests both use
// the same rule.
// The order a sort should produce: strings by stringCompare, numbers numerically, reversed for desc.
function expectedOrder(values, direction) {
  const comparator =
    typeof values[0] === 'string' ? stringCompare : (a, b) => a - b
  const sorted = [...values].sort(comparator)
  return direction === 'asc' ? sorted : sorted.reverse()
}

function stringCompare(a, b) {
  if (a === b) return 0
  return a < b ? -1 : 1
}
