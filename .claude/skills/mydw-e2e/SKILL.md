---
name: mydw-e2e
description: Automated end-to-end run of the Multi-Year & December Waste (MY&DW) release checks (epics MO-31, MO-65, MO-106) against LOCAL (time-shifted docker stack, EA DRP + EA CS) or tst (the csoc-e2e regulator × org-type matrix accounts). Runs tests/mydw-e2e.spec.js (cases TST-xx / LOC-xx from the release test cases), switches the LOCAL clock through scenarios S1/S2/S3, restores LOCAL data after accepting or rejecting, and writes a Word evidence pack per account plus SUMMARY.docx. Use when the user asks to run, automate or regress the MY&DW release, multi-year obligations or December Waste checks across accounts or environments, or wants evidence for the release.
user-invocable: true
allowed-tools: Bash, Read
argument-hint: --env local|tst [--regulator EA|NRW|SEPA|NIEA|all] [--org-type DRP|CS|all] [--cases TST-01,LOC-06|all] [--scenarios S2,S1,S3,S4] [--flags-off MY|DW] [--ticket MO-xxx] [--headed]
---

# MY&DW automated E2E

Runs the automated cases in `tests/mydw-e2e.spec.js` through `.claude/skills/mydw-e2e/runner.mjs`. The case ids match the MY&DW release test cases (`TST-xx` / `LOC-xx`, kept in Confluence). Each test title carries the Jira stories it covers.

**No duplicated code.** This skill reuses:

- **Accounts:** the `csoc-e2e` matrix accounts from `.claude/skills/csoc-e2e/data/matrix.js`.
- **From `mydw-manual-test`:** expected copy (`lib/copy.js`), December Waste year rules (`lib/rules.js`), locators (`lib/pages.js`), data snapshot/restore/seed (`lib/db.js`), and the scenario switch.
- **Evidence:** the screenshot recorder and Word builder from `utils/`.
- **PRN database:** `prn-db.mjs` reads it for the audit trail, obligation year and CSV checks. LOCAL goes through `mydw-manual-test` `lib/db.js`. tst uses `tst1_prn` over `mssql` with the same connection as `epr-playwright-bdd`, **SELECT only**.

For a ticket key, read the ACs first with the shared `jira-read` skill (`node .claude/skills/jira-read/jira.mjs issue <KEY>`), then choose `--cases`.

## Environments

|          | LOCAL                                                                                                                                        | tst                                                                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL      | `https://localhost:7084` (sibling `epr-local-environment`)                                                                                   | `https://rwd-tst1.azure.defra.cloud`                                                                                                                    |
| Accounts | EA DRP (POP QUEST LTD), EA CS (Organisation Name), via the mock B2C picker                                                                   | all 8 `csoc-e2e` matrix accounts (EA/NRW/SEPA/NIEA × DRP/CS), via real B2C                                                                              |
| Clock    | Switched per scenario: S2, then S1, S3 and S4 (31 Jan 2027, 15 Dec 2026, 1 Feb 2027, 15 Dec 2027); the original clock is put back at the end | Real date                                                                                                                                               |
| Data     | PRN snapshot/restore around every accept/reject case; MYDW-\* December Waste and PERN notes are seeded                                       | All the account's notes are set back to awaiting acceptance in `tst1_prn` before each account and after every accept/reject case (`--no-reset` to skip) |
| Cases    | Every `TST-xx` plus the time-dependent `LOC-xx`                                                                                              | `TST-xx` only                                                                                                                                           |

**tst database.** `prn-db.mjs` reads `MYDW_TST_DB_SERVER` / `_USER` / `_PASSWORD` (and optional `_NAME`, default `tst1_prn`) from `.env`. Without them it falls back to `DBSERVER` / `DBUSERNAME` / `DBPASSWORD` in `../epr-playwright-bdd/features/ENV/.env.tst` (or `MYDW_TST_DB_ENV_FILE`). If neither works, the database assertions are skipped with a note and the UI checks still run. Never print these values.

TST-16 (obligation year sent on accept) is no longer a separate manual case. Every accept/reject case (tagged `audit` in its title) checks the note's status and obligation year, plus the status-history row with its year and user. The organisation (K19) and the PERN confirm wording (K12) are not checked: neither is specific to MY&DW.

**Flag-aware.** The spec detects `ShowMultiYearObligations` from the home tile. With the flag off (tst until MO-623 launches) it checks the legacy behaviour instead: legacy tile, `choose-your-recycling-obligations-year` returns 404, legacy "How to meet" and accept copy. Cases that need the flag on are skipped with a reason. A LOCAL `--flags-off MY|DW` run restarts the frontend with that flag off at S2 and runs only its own case (LOC-16 or LOC-17). The same command works before and after launch.

## Running

Run from the repo root:

```
node .claude/skills/mydw-e2e/runner.mjs --env local                        # EA DRP + EA CS, scenarios S2, S1, S3, S4
node .claude/skills/mydw-e2e/runner.mjs --env local --flags-off MY         # LOC-16: ShowMultiYearObligations off (S2)
node .claude/skills/mydw-e2e/runner.mjs --env local --flags-off DW         # LOC-17: ShowDecemberWaste off (S2)
node .claude/skills/mydw-e2e/runner.mjs --env tst                          # all 8 matrix accounts
node .claude/skills/mydw-e2e/runner.mjs --env tst --regulator NRW --org-type DRP --cases TST-09,TST-13
```

**LOCAL preconditions:**

- **Stack:** running with time shift and mock B2C (`mydw-manual-test` `reference/scenarios.md`).
- **Snapshot:** a PRN snapshot exists (`node scripts/gather.js --snapshot` in `mydw-manual-test`, on a freshly seeded stack).
- **Docker:** the runner restarts `epr-packaging-frontend` and `b2c-mock` when it changes scenario or flags. Tell the user before starting a LOCAL run, because it rewrites `TIMESHIFT_DATETIME` in `epr-local-environment/.env` and puts it back afterwards.

**tst preconditions:**

- **Network:** the network can reach `rwd-tst1`.
- **Tell the user before running:** it writes to `tst1_prn` (resets the test accounts' notes to awaiting acceptance), and accept/reject cases change tst data.

## Output

`evidence/MYDW-E2E/<ticket>/<timestamp>/` (gitignored):

- **`SUMMARY.docx`:** every case for every account, with status, duration and failure or skip reason.
- **`<ENV>-<REG>-<ORG>.docx` per account,** e.g. `TST-NRW-DRP.docx`, `LOCAL-EA-CS.docx`. Each has the case table and numbered full-page screenshots captioned with the case id.
- **Per-account folders:** screenshots, downloaded CSVs/PDFs and the Playwright JSON results.

The console ends with pass/fail/skip counts and one line per non-passing case. The exit code is 1 when any case fails.

## Reporting failures

Map each failure to a story using the ids in its title, and check `mydw-manual-test` `reference/known-issues.md` (K-numbers) before calling it new. Expected failures at the time of writing:

- **K16:** TST-05 at S1/S2, details box loads expanded.
- **K17:** TST-19, CSV not year-specific.

## Manual steps

Every case in Parts A and B of the release test cases is automated. TST-17 (Welsh) runs too and fails until MO-575 is delivered.

Part C (E2E-01 to E2E-06) is manual on tst. Each one follows a December Waste PRN or PERN after accept or reject through RREPW, a cancel (admin portal or RREPW) and the Power BI report, none of which this suite can reach. Don't run the tst suite while one is in progress: it resets the account's notes to awaiting acceptance first.
