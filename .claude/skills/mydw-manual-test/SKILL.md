---
name: mydw-manual-test
description: Guide manual E2E testing of the DEFRA EPR Multi-Year obligations (FeatureManagement__ShowMultiYearObligations) and December Waste PRN (FeatureManagement__ShowDecemberWaste) features on the local docker stack (https://localhost:7084/report-data). Maps a Jira ticket's ACs or the June 2026 research hypotheses (H1–H6) to the MYDW-01..11 / MYDW-R journeys, sets the time-shift scenario, snapshots/restores PRN seed data, seeds December-issued December Waste PRNs/PERNs and standard PERNs from the time-shifted clock, drives a headed Chromium step by step with full-page screenshots, compares the UI with the December Waste year rules, and produces a Word evidence pack. Covers PRNs and PERNs. Use when the user asks to test MY/DW, multi-year obligations, December waste PRNs or PERNs, the "Choose a year" / "Which year's recycling obligations" screens, PRN acceptance year, or to run the MY&DW research walkthrough.
user-invocable: true
allowed-tools: Bash, Read, Write, Edit
argument-hint: [<ticket-key>] [--journeys MYDW-04,MYDW-08] [--org-type DRP|CS] [--role AP|DP|BU] [--note PRN|PERN] [--scenario S1|S2|S3] [--research]
---

# Multi-Year & December Waste manual test skill

Turns a ticket (or the research topic guide) into evidence for the RPD PRN-acceptance changes behind
`FeatureManagement__ShowMultiYearObligations` and `FeatureManagement__ShowDecemberWaste`. You drive Playwright; the
tester confirms each step in chat; the output is one `<cell name>.docx` per cell plus a `SUMMARY.docx`, side by side in the run folder, that also
rolls up observations against research hypotheses H1–H6.

Local stack only (the sibling `epr-local-environment` checkout, mock B2C). Unlike the Playwright suites in this repo, it is a manual, Claude-driven tool: it is not part of `npm test` or CI. Every step also prints what the automation observed, so
most verdicts are a quick confirm.

## Skill directory

```
waste-obligations-journey-tests/.claude/skills/mydw-manual-test/
  SKILL.md
  reference/
    journeys.md            # MYDW-01..11 + MYDW-R: purpose, steps, flags/options, data impact
    scenarios.md           # time-shift scenarios S0..S3, stack commands, December Waste rules, seeded PRNs
    hypotheses.md          # research H1..H6 -> screens -> journeys/steps
    known-issues.md        # behaviour observed on the local stack (Oct 2026) to re-check, not re-discover
    flags-off.compose.yml  # overlay to switch the flags off for MYDW-09
  prompts/ticket-parse.md  # AC -> journey mapping rules
  scripts/
    gather.js              # CLI: run a cell | --preflight | --scenario | --seed | --unseed | --rules | --snapshot | --restore | --data-status | --seed-flash | --finalize
    config.js              # org/role/user lookup, scenarios, hypotheses
    lib/                   # session (mock B2C sign-in, Welsh), pages (locators), rules (DW year logic port),
                           # db (sqlcmd snapshot/restore/seed), scenario (time-shift switch), preflight, prompt, evidence-store, docx-builder
    steps/                 # one module per journey
  .state/prn-snapshot.json # baseline PRN data (created by --snapshot)
  .state/seeded.json       # skill-seeded MYDW-* rows and their seeded state (created by --seed)
```

Evidence: `evidence/MYDW/<TICKET>/<YYYYMMDD-HHmmss>/<JOURNEY>-<ORG>-<ROLE>-<SCENARIO>[-CY][-PRN]/` (in this repo's gitignored `evidence/` folder, next to the CSoC evidence; set `MYDW_EVIDENCE_REPO` to put it elsewhere). Cells run within 12 hours share one run folder; set `MYDW_RUN_TS` to pin one.

All commands below run from `.claude/skills/mydw-manual-test` in the waste-obligations-journey-tests repo (`cd` there first; abbreviated as `G=node scripts/gather.js`).

## Workflow

Follow the phases in order.

### Phase 1 — Ingest

`$ARGUMENTS` may contain a ticket key, flags, or `--research`.

- **Ticket mode**: read the ticket with the shared `jira-read` skill from the repo root: `node .claude/skills/jira-read/jira.mjs issue <KEY>`. Show the summary line (type, status, parent epic) and extract the ACs, screens/URLs, years, org types, roles, Welsh and flag-off mentions from the description.
  - **Exit code 2 or 1** (no `JIRA_*` credentials, or the read failed): say why, then say exactly _"Paste the ticket Description and Acceptance Criteria here."_
  - **Release or epic testing**: list the scope with `jira.mjs children <EPIC[,EPIC]>`.
- **Research mode** (`--research`, or the user mentions the topic guide / hypotheses / user research session): ticket defaults to `MYDW-RESEARCH-<yyyymmdd>`; plan MYDW-R first, plus the journeys mapped in `reference/hypotheses.md`.
- No ticket and no research: use ticket `MYDW-ADHOC` and ask what to cover, offering the standard regression set (below).

### Phase 2 — Plan

Read `reference/journeys.md`, `reference/scenarios.md`, `reference/known-issues.md`, and apply `prompts/ticket-parse.md`.

Present a plan table and ask: _"Confirm the plan or reply with edits."_

| Journey | Org | Role | Scenario | Options                        | Commits data? | Decision | Rationale                     |
| ------- | --- | ---- | -------- | ------------------------------ | ------------- | -------- | ----------------------------- |
| MYDW-08 | DRP | AP   | S2       | –                              | no            | run      | AC2: years offered per DW PRN |
| MYDW-04 | DRP | AP   | S2       | --accept-year 2027             | yes           | run      | AC3: accept DW into next year |
| MYDW-04 | DRP | AP   | S2       | --note PERN --accept-year 2027 | yes           | run      | AC3 for PERNs                 |

Standard regression set (no narrowing): MYDW-01, 03, 04 (each offered year, PRN and `--note PERN`), 05 (PRN and PERN), 06, 07 (PRN and PERN), 08 for DRP and CS at S2; MYDW-08 again at S1 and S3; MYDW-10, MYDW-11 (AP + BU) at S2. MYDW-09 only if the ticket touches flag-off behaviour.

Group cells by scenario. Changing scenario means recreating the frontend, so do all of one scenario's cells first.

### Phase 3 — Preflight and data baseline

1. `test -d node_modules || npm install`. Playwright is pinned to 1.63.0. If Chromium fails to launch, run `npx playwright install chromium`.
   - **Assumed layout:** this repo and its sibling `epr-local-environment` share a parent folder (override with `MYDW_LOCAL_ENV_ROOT`), and the stack runs with the default compose project name (containers `epr-local-environment-*`).
2. `$G --preflight`: checks that all containers are healthy and that frontend health returns 200. It reports the flags, the frozen frontend clock and the detected scenario. Do not print secrets. If the stack is down, give the start command from `reference/scenarios.md` and stop.
3. If the detected scenario is not the planned one, get the tester's OK and then run `$G --scenario S1|S2|S3`.
   - **What it does:** rewrites `TIMESHIFT_DATETIME` in `epr-local-environment/.env` and recreates `epr-packaging-frontend` and `b2c-mock` from their local images (no pull, no build). It then waits for both to be healthy and re-seeds the MYDW-\* rows to match the new clock.
   - **Real clock:** S0 needs a full restart without `compose.timeshift.yml`.
   - **Restore afterwards:** tell the tester the previous value printed, and switch back at the end if they want.
4. Run `$G --data-status`:
   - **No snapshot:** if the stack was freshly seeded (`down -v` then `up`), run `$G --snapshot`. Otherwise ask the tester. A snapshot of already-mutated data makes `--restore` restore the wrong baseline.
   - **Drift present:** run `$G --restore`.
5. **Seed December Waste and PERN data:** run `$G --seed` (both orgs) or `$G --seed DRP|CS`, after the snapshot. This replaces the org's skill-owned `MYDW-*` rows.
   - The December is taken from the frontend's time-shifted clock: the current December, or the most recent one in Jan–Nov. Override with `--dec-year Y`.
   - **Why the date is explicit:** the PRN backend isn't time-shifted, so "issued in December" is written as an explicit IssueDate.
   - **Future dates:** rows whose issue date would fall after the frontend clock are skipped (e.g. the January row in S1).
   - **What it adds per org:** see `reference/scenarios.md`.
     - December Waste PRN issued 10 Dec (blue tag)
     - December Waste PERN issued 12 Dec (blue tag)
     - December Waste PRN issued 15 Jan (blue tag)
     - December Waste PRN issued 28 Nov (no tag)
     - two standard PERNs for C
   - **Restore:** `--restore` puts these rows back to their seeded state too. `--unseed` removes them.
6. Run `$G --rules --org-type DRP` (and `CS`). Show the expected per-note table so the tester knows what each PRN/PERN should do at this clock.

### Phase 4 — Run cells

For each approved cell:

```
$G --ticket <TICKET> --journey <MYDW-NN> --org-type <DRP|CS> --role <AP|DP|BU> \
   [--note PRN|PERN] [--year <Y>] [--accept-year <Y>] [--prn <NUMBER>] [--dry-run] [--headless]
```

`--note PERN` makes MYDW-04/05/07 pick the seeded PERN (`MYDW-<DP|CS>-PERN-DW-DEC`, `-PERN-STD`, `-PERN-STD-2`). With PRNs, MYDW-04 prefers the seeded December-issued PRN when present. `--prn` overrides both. MYDW-06 picks one PRN + one PERN when both are on page 1 of the list.

Run it with Bash in the background with stdin piped, so you can relay prompts. The child prints info lines and prompt blocks:

```
<<STEP id=NN title="..." journey=MYDW-NN>>
<expected result>
[Hn] <hypothesis> Observe: <what to watch>        (only on research-mapped steps)
Observed by automation: <what the script saw>      (when available)
Automation error: <message>                        (when an action failed)
Reply PASS / FAIL <reason> / NOTE <text> / SKIP.
<<AWAIT>>
```

- Relay each block to the tester: what to look at in the browser, the expected result, and the observed value.
- **Highlight mismatches.** Point out where the observed value contradicts the expected result, any `MISMATCH`, and any behaviour already listed in `reference/known-issues.md`.
- **Forward replies exactly.** Write the tester's reply verbatim plus a newline to stdin.
- **Never auto-answer for the tester.** `MYDW_AUTO_REPLY` exists only for unattended smoke runs whose verdicts are not evidence.
- **Keep going after a FAIL** unless the tester stops.

**Data:**

- **Journeys that commit data:** MYDW-04, 05, 06 and 07. After each of them, and before any journey that needs pristine data, run `$G --restore`. Confirm `remainingDrift: []`.
- **`--dry-run`:** stops before every "Yes, accept/reject" and bulk "Accept".
- **Read-only journeys:** 01, 02, 03, 08, 09, 10, 11 and R (with `--dry-run`).

### Phase 5 — Finalise

`$G --finalize --ticket <TICKET>` writes, side by side in the run folder, ready to attach to Jira together:

- **`<cell name>.docx`** per cell, e.g. `MYDW-12-DRP-AP-S2-Y2027.docx`: cover with scenario/clock/flags/frontend image, preconditions, steps with hypothesis column and automation observations, screenshots, defects, sign-off.
- **`SUMMARY.docx`**: pass/fail table linking to each pack, plus H1–H6 observations collected from NOTEs on hypothesis-tagged steps.

The cell folders keep the raw screenshots and `run.json`.

### Phase 6 — Handoff

1. Print the evidence folder.
2. Ask _"Open SUMMARY.docx now?"_. If yes, run `open <path>`.
3. List the FAILs as defect candidates (title, steps, expected vs actual, screenshot path).
4. Remind the tester to attach the packs to the Jira ticket. `jira-read` is read-only, so attachments are manual.
5. Leave the data restored: run `$G --restore`. If you switched scenario, offer to switch back (`$G --scenario <previous>`).

## Standalone use

```
cd .claude/skills/mydw-manual-test   # from the waste-obligations-journey-tests repo root
node scripts/gather.js --preflight
node scripts/gather.js --rules --org-type CS
node scripts/gather.js --ticket MO-500 --journey MYDW-04 --org-type DRP --accept-year 2027   # answer at the PASS/FAIL prompt
node scripts/gather.js --restore
node scripts/gather.js --finalize --ticket MO-500
```

## Non-goals

- dev/tst/CDP environments, as journeys depend on SQL snapshot/restore and the time-shifted local container
- waste-obligations-frontend (`localhost:8015`) PRN screens
- Writing to Jira (comments, attachments, transitions). Reading uses the shared `jira-read` skill.
