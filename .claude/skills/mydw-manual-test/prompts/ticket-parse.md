# Ticket → MY/DW plan (mental model for Claude)

Map each acceptance criterion to journeys in `reference/journeys.md`. Then choose the org types, roles and scenarios.

## Signals

| Ticket keyword / URL fragment                                                                                                     | Journeys                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| "tile", "home page", "dashboard", "Manage recycling obligations"                                                                  | MYDW-01                                                                          |
| "choose a year", "year selection", `choose-your-recycling-obligations-year`, "multi-year"                                         | MYDW-01, MYDW-02                                                                 |
| "obligations page", "progress", "grid", "CSV", `manage-your-recycling-obligations`                                                | MYDW-02                                                                          |
| "How to meet your recycling obligations", "alternative content", "no H2 POM", "not calculated", "regular content"                 | MYDW-12 per year × flag on/off (S2 2027/2026, S3 2027/2026)                      |
| "accept or reject list", "select PRNs", "checkbox", "sort", "filter", `view-awaiting-acceptance`                                  | MYDW-03                                                                          |
| "December waste", "DW", "acceptance year", "which year", `choose-acceptance-year`, "flash", "blue tag", "can be accepted towards" | MYDW-04, MYDW-08 (+ MYDW-03 #06)                                                 |
| "accept PRN", "confirmation", "success", `accept-prn`, `accepted-prn`                                                             | MYDW-04, MYDW-05                                                                 |
| "bulk", "multiple", "review your selection", `accept-bulk`, `accepted-prns`                                                       | MYDW-06                                                                          |
| "reject"                                                                                                                          | MYDW-07                                                                          |
| "1 February", "January", "deadline", "expired", "window", "date", "time travel"                                                   | MYDW-08 across S1, S2, S3                                                        |
| "feature flag", "flag off", "toggle", "ShowMultiYearObligations", "ShowDecemberWaste"                                             | MYDW-09                                                                          |
| "Welsh", "Cymraeg", "cy", "translation"                                                                                           | MYDW-10                                                                          |
| "basic user", "delegated", "permissions", "authorisation", "404", "error page"                                                    | MYDW-11                                                                          |
| "user research", "hypothesis", "usability", "prototype", "participant"                                                            | MYDW-R (+ journeys in `hypotheses.md`)                                           |
| "compliance scheme", "CSO", "statement of compliance"                                                                             | add CS rows                                                                      |
| "direct producer", "DRP", "certificate of compliance"                                                                             | add DRP rows                                                                     |
| "PERN", "export"                                                                                                                  | add `--note PERN` rows for MYDW-04/05/07 (requires `--seed`); MYDW-06 mixed pick |

## Defaults

- **Org types:** DRP and CS, unless the ticket names one.
- **Role:** AP, plus DP for any journey that commits data. Use BU only for MYDW-11.
- **Data:** plan `--seed` after the snapshot whenever December Waste, blue tags or PERNs are in scope.
- **Scenario:** S2 for everything. Add S1 for blue tags or December copy. Add S3 for "after the window" or expiry ACs. MYDW-08 runs in every scenario the plan touches.
- **MYDW-04 accept year:** run once per offered year (`--accept-year C` and `--accept-year C+1`).
- **Data restore:** mark MYDW-04/05/06/07 cells "commits data". Plan a `--restore` after each.
- **MYDW-09:** `manual-only` unless the tester agrees to recreate the frontend with the flags-off overlay.
- **Unsure whether a journey applies:** propose `run` and let the tester downgrade it.
- **Known behaviour:** say which `known-issues.md` items the plan will re-check.
