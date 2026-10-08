# Environments and test data

## Feature flags (Packaging frontend)

- `FeatureManagement__ShowMultiYearObligations`: the year tile, "Choose a year" and the per-year pages. Off, the
  home page shows the legacy single-year link and `choose-your-recycling-obligations-year` returns 404.
- `FeatureManagement__ShowDecemberWaste`: the year choice for December Waste notes and the blue tags.
- Both are on in LOCAL (hard-coded in `epr-local-environment` `compose.yml`) and on tst since 8 Oct 2026. Detect the
  state from the page (the home tile) rather than assuming it.

## LOCAL

- `https://localhost:7084/report-data`, from the sibling `epr-local-environment` checkout, with mock B2C at
  `https://localhost:8443` (pick the user's button).
- **Time shift:** `compose.timeshift.yml` runs the frontend under `faketime` with a **frozen** clock set by
  `TIMESHIFT_DATETIME` in `epr-local-environment/.env`. Only `epr-packaging-frontend` and `b2c-mock` are shifted;
  the PRN backend and `waste-obligations` use the real date, so status-history timestamps are real.
- **Scenarios:** S1 15 Dec 2026 12:00 (December window), S2 31 Jan 2027 23:59:59 (last second of the window),
  S3 1 Feb 2027 00:00:01 (after the window), S4 15 Dec 2027 12:00 (a year on, to catch hard-coded years).
- **Accounts:** POP QUEST LTD (DRP) and Organisation Name (CS), each with AP, DP and basic users.
- **Data:** the `mydw-manual-test` skill snapshots and restores the PRN tables, and seeds `MYDW-DP-…` / `MYDW-CS-…`
  December Waste and PERN notes (issue dates follow the frontend clock). Restore after every accept or reject.
- Anything needing December/January, 1 February or a flag switched off can only be tested here.

## tst

- `https://rwd-tst1.azure.defra.cloud/report-data`, real B2C, real clock.
- Accounts: the 8 `csoc-e2e` matrix accounts (EA/NRW/SEPA/NIEA × DRP/CS) from `.env`.
- Accepting or rejecting changes shared data, and the automated run resets the accounts' notes to awaiting
  acceptance in `tst1_prn`. Tell the user before either.
- Cross-system checks (RREPW, the admin portal, Power BI) can only be done here, by hand.

## Skills (on `feat/manual-test-skills` until it merges)

- `mydw-manual-test`: tester-confirmed MY&DW journeys on LOCAL (clock, seed, snapshot/restore, Word evidence).
- `mydw-e2e`: the automated MY&DW release run (`tests/mydw-e2e.spec.js`, cases TST-xx / LOC-xx) on LOCAL and tst.
- `csoc-e2e`: the CSoC E2E matrix run. `unsubmitted-orgs`: the unsubmitted organisations search.
- `jira-read` / `jira-write`: read tickets and epics; comment on or attach evidence to an issue.
- `e2e-test-plan`: build a release E2E test plan from epic ids.

## Known issues

`.claude/skills/mydw-manual-test/reference/known-issues.md` lists the MY&DW observations as K-numbers. The user ruled
K1, K5, K9, K12, K18, K19 and K20 existing behaviour, not MY&DW, and K21 is withdrawn: don't report them as release
defects.
