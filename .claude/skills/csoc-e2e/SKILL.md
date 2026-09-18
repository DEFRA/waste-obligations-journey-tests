---
name: csoc-e2e
description: |
  Automates the full CSoC (Certificate/Statement of Compliance) E2E journey
  across the (regulator × org-type) matrix. Runs the producer service in
  waste-obligations-journey-tests, then the Approve & Monitor flow in the
  sibling waste-packaging-regulator-tests repo, captures a full-page
  screenshot of every visited page, and produces one Word evidence pack per
  journey run for regulator/PO sign-off.

  Use when the user asks to run a CSoC E2E journey, references an E2E-NN
  journey code (E2E-00 … E2E-09), asks for evidence for a specific regulator
  (EA, NRW, SEPA, NIEA) or org type (DRP, CS), or wants a full matrix sweep.
---

## When to trigger

Invoke this skill when the user says any of:

- "run CSoC E2E for EA/NRW/SEPA/NIEA"
- "produce the evidence pack for E2E-01.1"
- "run the full CSoC matrix"
- references any journey code E2E-00 through E2E-09
- asks for CSoC screenshots / a Word doc of a journey

Out of scope: public register, notification emails, PRNs. Do not attempt to
verify these — the plan intentionally excludes them.

## How to invoke

Parse the user's request into:

- `--journey <code>` — required. One of E2E-00, E2E-01.1, E2E-01.2, E2E-01.3a,
  E2E-01.3b, E2E-01.3c, E2E-02 … E2E-09.
- `--regulator <EA|NRW|SEPA|NIEA>` — required unless `--matrix all`.
- `--org-type <DRP|CS>` — required unless `--matrix all`.
- `--matrix all` — sweeps all 8 (regulator, org-type) combinations for the
  given journey. Overrides `--regulator`/`--org-type`.
- `--headed` — optional. Runs Playwright with a visible browser.

Only two journeys are implemented end-to-end today:

- **E2E-01.1 DRP happy path** — producer submits certificate → regulator
  approves.
- **E2E-01.2 CS compliant** — producer submits statement with Reg 43 = YES
  → regulator approves.

Every other journey is scaffolded but marked as `test.fixme` on both sides.
The harness still runs against those, producing an evidence pack with the
scaffolding notes so it's clear they're pending implementation.

Then run, from the repo root:

```bash
node .claude/skills/csoc-e2e/runner.mjs --journey <code> --regulator <code> --org-type <code>
```

Or equivalently: `npm run test:csoc-e2e -- --journey ... --regulator ... --org-type ...`.

## Preconditions to check before running

1. Current working directory is `waste-obligations-journey-tests`. If not,
   `cd` there first.
2. `.env` has values for:
   - `REGULATOR_PORTAL_BASE_URL`
   - `REGULATOR_DASHBOARD_BASE_URL`
   - `REGULATOR_EMAIL_EA`, `REGULATOR_EMAIL_NRW`, `REGULATOR_EMAIL_SEPA`,
     `REGULATOR_EMAIL_NIEA`
   - `REGULATOR_PASSWORD_EA`, `REGULATOR_PASSWORD_NRW`,
     `REGULATOR_PASSWORD_SEPA`, `REGULATOR_PASSWORD_NIEA`
   - `REGULATOR_TESTS_PATH` (path to the sibling regulator repo)
   - `WASTE_OBLIGATION_USERNAME` / `PASSWORD` / `JOURNEY_USER` / `PASSWORD`
     for the declarations-API basic auth
     If any are missing, tell the user which vars need filling in — don't guess.
3. Sibling `REGULATOR_TESTS_PATH` exists and is on branch `feature/csoc-e2e-skill`
   with `csoc-e2e-external.spec.js` present under `test/specs/`.
4. `docx` is installed (`npm ls docx` — should show `docx@9.x`).

## What the skill returns

Each run produces:

- `evidence/CSoC/<journey>_<regulator>_<orgtype>_<timestamp>/screenshots/*.png`
- `evidence/CSoC/<journey>_<regulator>_<orgtype>_<timestamp>/<journey>_<regulator>_<orgtype>_<timestamp>.docx`

Relay the absolute path to the .docx back to the user when the run completes.
If the run failed, still surface the docx path (it includes whatever
screenshots were captured before the failure) plus a short summary of what
Playwright reported failing.

## Things this skill does NOT do

- Does not verify public register updates.
- Does not verify notification emails.
- Does not verify PRNs.
- Does not seed backend obligation totals for non-compliant CS variants
  (E2E-01.3) or the missing-obligations case (E2E-05). Those journeys need
  backend seed helpers that live outside this skill.
