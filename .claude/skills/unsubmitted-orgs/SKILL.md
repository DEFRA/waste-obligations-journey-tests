---
name: unsubmitted-orgs
description: |
  Verifies the "Unsubmitted Organisations Search" backend endpoint
  (GET /compliance-declarations/unsubmitted). Covers all six ACs on the
  ticket — eligibility filter (AC1), required response fields (AC2), query
  filters (AC3), search (AC4), pagination (AC5), sort (AC6) — plus the QA
  edge cases (year-end boundary, unregistered orgs, DP→CSO migration,
  performance). Captures every HTTP request/response as a transcript and
  builds a Word evidence pack for ticket sign-off.

  Use when the user references the "not submitted" / "unsubmitted
  organisations" endpoint, asks to verify the ticket's ACs, or asks for an
  API evidence pack for the endpoint.
---

## When to trigger

Invoke this skill when the user says any of:

- "test the unsubmitted-orgs endpoint"
- "verify the not-submitted search"
- "evidence for the unsubmitted-organisations ticket"
- references AC1..AC6 on the ticket
- asks about `/compliance-declarations/unsubmitted`

## How to invoke

From the repo root:

```bash
node .claude/skills/unsubmitted-orgs/runner.mjs [--obligation-year YYYY] [--headed]
```

Or via npm: `npm run test:unsubmitted-orgs -- [--obligation-year YYYY]`.

Optional flags:

- `--obligation-year YYYY` — overrides the year used in baseline queries.
  Defaults to the current year. Useful for year-end verification.
- `--headed` — visible browser (not strictly needed — this is an API spec —
  but useful when combined with Playwright's UI mode for debugging).

Extra env vars the spec picks up (both optional, unlock deeper edge-case
assertions when set):

- `UNREGISTERED_ORG_REF` — reference number of a known unregistered org;
  the edge-case test then asserts it does NOT appear in results.
- `MIGRATED_ORG_REF` — reference number of an org that has moved from DP
  to CSO; the migration edge case asserts its `registrationType`.

## Preconditions

1. Current working directory is `waste-obligations-journey-tests`.
2. `.env` has:
   - `WASTE_OBLIGATION_USERNAME` / `WASTE_OBLIGATION_PASSWORD` — Basic Auth
     for the backend (e.g. `Developer` / …).
   - `WASTE_OBLIGATIONS_BACKEND_URL` — for shared envs (tst/dev) this must
     point at the CDP protected gateway including the service prefix, e.g.
     `https://ephemeral-protected.api.test.cdp-int.defra.cloud/waste-obligations`.
     For a direct-to-service local run, use `http://localhost:8007` (or leave
     unset and set `ENVIRONMENT=local`).
   - `WASTE_OBLIGATIONS_API_KEY` — required for tst/dev (the CDP gateway's
     `x-api-key`). Not needed for local. The runner refuses to start if the
     target env is not `local` and this var is unset.
3. `docx` is installed (introduced by the CSoC E2E skill dependency).

If a required var is missing, tell the user which one and stop.

## What the skill returns

- `evidence/api/unsubmitted-orgs_<timestamp>/transcripts/*.txt` — one
  request/response transcript per API call across both specs (search AC1–AC6
  and the lifecycle per-org walk).
- `evidence/api/unsubmitted-orgs_<timestamp>/unsubmitted-orgs_<timestamp>.docx`
  — Word evidence pack with cover (title · env · status · timestamp) and
  transcripts rendered as monospace grey-shaded blocks.

Relay the absolute `.docx` path to the user for ticket attachment. On
failure, still surface the path — the doc contains whatever was captured
before the assertion failed, plus a summary of what Playwright reported.

## What runs

Two specs, both driven by the runner:

- **`unsubmitted-organisations-api.spec.js`** — AC1–AC6 across the
  4-country × 2-registrationType matrix using 8 known test orgs, plus
  diagnostic tests (null `recyclingObligationsMet` distribution, year-end
  boundary, unknown-reference behaviour, performance).
- **`unsubmitted-organisations-lifecycle.spec.js`** — per known org (DP
  and CSO): reset → create declaration → assert absent → cancel → assert
  present → create → accept → assert absent → cleanup. Each transition is
  wrapped in a `waitFor()` (30s ceiling) to bridge any eventual-consistency
  lag between the write and the endpoint's next read.

The lifecycle spec sets 5-minute per-test timeout for 8 orgs × 6 steps —
budget ~10–15 minutes for a full run against tst.

## Known-flaggable

- **AC2 asserts `country` is present on every returned row.** The backend
  DTO may not currently emit that field. If AC2 fails on `country` absence,
  that's the bug to raise against the service — not a test-code fix.
- **Edge-case tests for unregistered/DP→CSO skip** if the corresponding
  env var (`UNREGISTERED_ORG_REF` / `MIGRATED_ORG_REF`) isn't set. Both
  still emit a transcript noting the QA-manual step.

## Out of scope

- The polling mechanism from Synapse → CDP (needs infra access, separate
  harness).
- Regulator FE adoption of the endpoint (ticket calls this out).
- CSV / export flows.
