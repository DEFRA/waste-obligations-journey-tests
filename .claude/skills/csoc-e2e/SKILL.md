---
name: csoc-e2e
description: |
  Automates the full CSoC (Certificate/Statement of Compliance) E2E journey
  across the (regulator × org-type) matrix. Runs the producer service in
  waste-obligations-journey-tests, then the Approve & Monitor flow in the
  sibling waste-packaging-regulator-tests repo, captures a full-page
  screenshot of every visited page, captures the GOV.UK Notify emails sent on
  submission, resubmission and cancellation (via the Gmail connector), and
  produces one Word evidence pack per journey run for regulator/PO sign-off.

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

Out of scope: public register, PRNs. Do not attempt to verify these — the
plan intentionally excludes them.

## Ticket context

If the user gives a ticket key (e.g. `MO-233`), read it first with the shared `jira-read` skill from the repo root: `node .claude/skills/jira-read/jira.mjs issue <KEY>`. Use its ACs to choose the journeys and the regulator × org-type cells, and quote the summary line in your plan. On exit code 2 or 1, say why and ask the user to paste the ACs. Don't copy the Jira code into this skill.

## How to invoke

Parse the user's request into:

- `--journey <code>` — required. One of E2E-00, E2E-01.1, E2E-01.2, E2E-01.3a,
  E2E-01.3b, E2E-01.3c, E2E-02 … E2E-09.
- `--regulator <EA|NRW|SEPA|NIEA>` — required unless `--matrix all`.
- `--org-type <DRP|CS>` — required unless `--matrix all`.
- `--matrix all` — sweeps every regulator × the org types the journey
  applies to (E2E-01.1 is DRP-only; E2E-01.2/01.3a/01.3c are CS-only;
  E2E-04/08 run for both).
- `--journey all` — every implemented journey × every regulator × its org
  types: 32 runs, one evidence pack each, plus a summary table at the end.
  `--regulator` / `--org-type` narrow it (e.g. `--journey all --regulator EA`
  = 8 runs). Takes ~1½–2 hours for the full sweep.
- `--dry-run` — print the planned runs and exit.
- `--headed` — optional. Runs Playwright with a visible browser.
- `--no-emails` — optional. Skips notification-email capture.

Journeys implemented end-to-end today (phase plans in `PHASES_BY_JOURNEY`
in `runner.mjs`):

- **E2E-01.1 DRP happy path** — producer submits certificate → regulator
  approves.
- **E2E-01.2 CS compliant** — producer submits statement with Reg 43 = YES
  → regulator approves.
- **E2E-01.3a / E2E-01.3c CS Reg 43 = NO** — same shape as E2E-01.2.
- **E2E-04** — submit → regulator cancels → producer resubmits → history
  check.
- **E2E-08** — submit → approve → cancel → resubmit → approve → history
  check.

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
5. For email capture, the `claude` CLI is on PATH and logged in, and
   `claude mcp list` shows **claude.ai Gmail ✔ Connected**, signed in as
   francis.chelladurai@equalexperts.com — the inbox every `+tst+` producer
   test account delivers to. (The Equal Experts Workspace allows neither
   IMAP app passwords nor a self-created OAuth app, so the connector is the
   only route.) If Gmail isn't connected the run still completes and the
   pack shows the emails as NOT RECEIVED with the reason.

## Notification emails (automatic)

Every submission, resubmission and cancellation sends a GOV.UK Notify email
to the producer organisation (the DRP or CS matrix account) — the regulator
is never a recipient. The runner captures these itself after the last phase;
there is no separate step:

1. It writes `emails/expected.json` (one entry per triggering phase, with its
   time window and the producer's `+tst+` address).
2. `email-capture.mjs` runs a headless `claude -p` limited to the two
   read-only Gmail connector tools (custom one-line system prompt, no
   built-in tools or skills) that returns every message sent to that address
   since the run started. ≈$0.27 of Claude usage per run with the default
   Sonnet. Don't switch `CSOC_EMAIL_MODEL` to Haiku: it was seen altering
   characters (curly → straight quotes) while copying the HTML. Missing
   emails are retried twice, 45s apart.
3. Messages are matched to triggers in arrival order, with a subject guard
   (a "…has received your…" email can't be taken as the cancellation email
   and vice versa) — submission and resubmission emails are otherwise
   identical.
4. `render-emails.mjs` screenshots each email with a From/To/Subject/
   Received/message-id header, and the pack gets a "Notification emails"
   section (summary table + one page per email). Missing emails are listed
   in red with the search that was run.

`--no-emails` (or `CSOC_EMAIL_CAPTURE=0`) skips all of this. To re-render a pack by hand (e.g. after
fixing `emails/*.json`): `node .claude/skills/csoc-e2e/render-emails.mjs <evidenceDir>`.

## What the skill returns

Each run produces:

- `evidence/CSoC/<journey>_<regulator>_<orgtype>_<timestamp>/screenshots/*.png`
- `evidence/CSoC/<journey>_<regulator>_<orgtype>_<timestamp>/emails/` —
  `expected.json`, plus per-email `.json` / `.html` / `.png`
- `evidence/CSoC/<journey>_<regulator>_<orgtype>_<timestamp>/run.json` — run
  metadata used to rebuild the pack
- `evidence/CSoC/<journey>_<regulator>_<orgtype>_<timestamp>/<journey>_<regulator>_<orgtype>_<timestamp>.docx`

Relay the absolute path to the .docx back to the user when the run completes.
If the run failed, still surface the docx path (it includes whatever
screenshots were captured before the failure) plus a short summary of what
Playwright reported failing. Also report the email tally (e.g. "Emails: 5/6
received") and name any NOT_FOUND ones.

## Things this skill does NOT do

- Does not verify public register updates.
- Does not assert email wording — it captures the emails as evidence for
  the reviewer; it only flags ones that never arrived.
- Does not verify PRNs.
- Does not seed backend obligation totals for non-compliant CS variants
  (E2E-01.3) or the missing-obligations case (E2E-05). Those journeys need
  backend seed helpers that live outside this skill.
