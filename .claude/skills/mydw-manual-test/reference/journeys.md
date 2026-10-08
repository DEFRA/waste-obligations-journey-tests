# MY & DW journeys

Each journey lives in `scripts/steps/mydw-*.js` and is run once per cell: org type × role × scenario, plus language and PRN options where relevant. Every step screenshots the page and prints what the automation observed.

| Id      | Title                                                                              | Commits data           | Key options                             | Hypotheses |
| ------- | ---------------------------------------------------------------------------------- | ---------------------- | --------------------------------------- | ---------- |
| MYDW-01 | Dashboard tile and year selection                                                  | no                     | –                                       | H1, H2     |
| MYDW-02 | Obligations page for a chosen year                                                 | no                     | `--year`                                | –          |
| MYDW-03 | Accept/reject list: selection rules, copy, sort, blue tags, reject discoverability | no                     | `--year`                                | H3         |
| MYDW-04 | December Waste PRN/PERN accepted with a choice of year                             | **yes**                | `--note PERN`, `--prn`, `--accept-year` | H4, H5     |
| MYDW-05 | Single-year PRN/PERN accepted without a year page                                  | **yes**                | `--note PERN`, `--prn`                  | –          |
| MYDW-06 | Bulk accept: select, review, remove, accept                                        | **yes**                | –                                       | H5, H6     |
| MYDW-07 | Reject a PRN/PERN                                                                  | **yes**                | `--note PERN`, `--prn`                  | H3         |
| MYDW-08 | Time-window rules: every PRN vs `lib/rules.js`                                     | no                     | run per scenario                        | –          |
| MYDW-09 | Flags off: legacy behaviour                                                        | no                     | needs `flags-off.compose.yml`           | –          |
| MYDW-10 | Welsh (cy) pass over the new screens                                               | no                     | `--prn`                                 | –          |
| MYDW-11 | Roles and cross-org/unknown PRN access                                             | no                     | `--role AP\|DP\|BU`                     | –          |
| MYDW-R  | Research walkthrough: topic guide screens 1–6 with probes                          | yes unless `--dry-run` | `--prn`                                 | H1–H6      |

`applies()` skips a cell, with a reason, when the PRN is not actionable at the current clock, the requested `--accept-year` is not offered, or flags don't suit the journey (MYDW-01/02/04 need ShowMultiYearObligations on; MYDW-09 needs at least one flag off).

---

## MYDW-01: Dashboard tile and year selection

1. Sign in.
2. The tile reads "Manage recycling obligations" / "View or manage your recycling obligations by year (includes PRNs and PERNs)." / "An approved or delegated person must submit your C certificate|statement of compliance on or before 31 January C+1." / "Search all PRNs and PERNs". **[H1]**
3. The tile opens "Choose a year" with radios C+1 … 2025 and no hint text. **[H2]**
4. Continue with nothing selected shows "Select a year".
5. C+1: "Manage your C+1 recycling obligations", "not calculated yet" copy, December waste explainer. **[H2]**
6. C: grid with obligations and the CSoC link.
7. 2025: historic "Your … record for 2025" page.
8. Home, then "Search all PRNs and PERNs".

## MYDW-02: Obligations page for a chosen year (`--year`, default C)

1. Sign in.
2. Choose the year; heading and deadline "You have until 31 January Y+1".
3. Grid and glass breakdown (awaiting/accepted only for year-Y PRNs).
4. Glass drill-down for year Y (check the figures, not just the heading).
5. "Accept or reject PRNs and PERNs". Is the list scoped to Y? (Locally it is not.)
6. Download the CSV for Y, saved into the cell folder. Check it contains only Y.

## MYDW-03: Accept or reject list

1. Sign in.
2. List via the obligations page.
3. Checkboxes match the rules: exactly-one-year PRNs only.
4. Copy check: raw resource keys, empty legend, hidden link text.
5. Sort "December waste (yes to no)".
6. Blue tags: expected vs shown (use `--seed-flash` in S1/S2).
7. No reject control on the list. **[H3]**
8. Open a PRN; Accept and Reject are both present. **[H3]**

## MYDW-04: December Waste accept with a choice of year

- **Default note:** the seeded `MYDW-<tag>-PRN-DW-DEC` if present, else DP-PRN-010-RREPW / PRN-015-RREPW.
- **`--note PERN`:** uses `MYDW-<tag>-PERN-DW-DEC`.
- **`--accept-year`:** defaults to the later year.

Steps 03 and 06 compare the heading, warning, confirm question and browser title with the expected copy, and print `MISMATCH` if they differ. PERN copy:

- page heading "Packaging Waste Export Recycling Note";
- warning "This PERN relates to waste exported for reprocessing in December Y.";
- "Which year’s recycling obligations do you want to accept this PERN towards?";
- "Are you sure you want to accept this PERN towards your Y recycling obligations?";
- browser title "Accept this PERN";
- "You accepted this PERN towards your Y recycling obligations".

1. Sign in.
2. Baseline grids for both offered years.
3. PRN page: "December waste? Yes", December warning, blue tag if in window.
4. Accept opens the year page: "Which year's recycling obligations do you want to accept this PRN towards?" with [P, P+1].
5. Continue with no year shows "Select a year".
6. Choose a year; confirmation "Are you sure you want to accept this PRN towards your Y recycling obligations?" **[H4]**
7. "No, go back" goes to the PRN page; Accept again **reuses the session year without re-asking**. **[H4]**
8. Yes, accept: banner "You accepted this PRN towards your Y recycling obligations" and "Accepted towards Y recycling obligations".
9. "View recycling obligations progress": which year does it land on? **[H5]**
10. Y grid: accepted +t, and DB ObligationYear = Y. **[H5]**
11. Other-year grid: accepted unchanged; awaiting −t if it was the PRN's original year.

Run it twice per org/scenario, once for each offered year (`--accept-year`), with `--restore` in between.

## MYDW-05: Single-year accept (default DP-PRN-009-RREPW / PRN-003-RREPW; `--note PERN` uses MYDW-<tag>-PERN-STD; `--prn DP-PRN-002-NPWD-DEC` for the 2025-DW case)

1. Sign in.
2. Baseline.
3. Accept goes straight to the confirmation for C.
4. Yes, accept: banner shows C.
5. Grid: accepted +t, awaiting −t.

## MYDW-06: Bulk accept

1. Sign in.
2. Baseline and list. No two-year December Waste PRN or PERN is selectable. One PRN and one PERN are picked when both are on page 1.
3. "Accept selected" with nothing selected shows "Select one or more PRNs or PERNs to accept them".
4. Select two; "Review your selection before accepting", grouped by material, with no year stated. **[H6]**
5. Remove one: "You've removed PRN number …". **[H6]**
6. Remove the last: "You've removed all the selected PRNs" and a way back. **[H6]**
7. Reselect and click Accept. **This commits immediately.** "You’ve accepted 2 PRNs and PERNs towards your C recycling obligations" for a mixed pick, or "…2 PERNs…" / "…2 PRNs…".
8. Progress grid and DB. **[H5]**

## MYDW-07: Reject (default DP-PRN-008-RREPW / PRN-014-RREPW; `--note PERN` uses MYDW-<tag>-PERN-STD-2)

1. Sign in.
2. Baseline.
3. "Reject this PRN?" / "This is permanent and cannot be undone." **[H3]**
4. "No, go back" goes to the PRN page.
5. Yes, reject: "PRN rejected", status REJECTED.
6. The PRN is gone from the list; awaiting −t; DB status 2, year unchanged.

## MYDW-08: Time-window rules (run in S1, S2, S3; optionally S0)

1. Sign in.
2. Year-picker options.
3. Read every page of the list (10 rows per page): checkboxes and blue tags. Flag any awaiting note that is not listed.
4. One step per PRN and PERN of the org, including the MYDW-\* seeded rows: open it, click Accept to reach the year page or the confirmation (both GET only, nothing is committed), and compare actions, years, checkbox and tag with `lib/rules.js`. Each step reports either `matches rules` or `MISMATCH: …`.

## MYDW-09: Flags off

Recreate the frontend with `reference/flags-off.compose.yml`, choosing which flags are off. Then check:

1. Sign in.
2. Legacy tile "Manage your C recycling obligations".
3. `choose-your-recycling-obligations-year` returns 404.
4. The obligations page is always for C.
5. No blue tags. The "December waste" column and warning remain.
6. Accept on a DW PRN shows no year page and the legacy copy "Accept this PRN towards your C recycling obligations?". Do not commit.

Recreate without the overlay afterwards.

## MYDW-10: Welsh

Switch language with `/report-data/culture?culture=cy&returnUrl=…` (`?culture=` on other pages is ignored). Pages covered: home tile, "Choose a year" (and its error), obligations C+1, list, PRN page, year page, confirmation. Each step reports `html lang` and English strings that leaked through. Read-only.

## MYDW-11: Roles and access

1. Sign in.
2. As this role: is the tile shown, and are Accept/Reject on own PRNs?
3. Direct GET of `accept-prn` on own PRN.
4. Direct GET of `choose-acceptance-year` on own PRN.
5. Other org's PRN on `selected-prn`. Expect a handled 404/403.
6. Other org's PRN on `choose-acceptance-year`. Expect a handled 404/403.
7. Other org's PRN on `accept-prn`. Expect a handled 404/403.
8. Unknown GUID. Expect a handled 404.

Run for AP, DP and BU.

## MYDW-12: "How to meet" section content (MO-449)

Read-only. The expected variant comes from `ShowMultiYearObligations` and the org's `ObligationCalculations` rows for the year: none means alternative (no H2 POM), any means regular, including a partly calculated year. Expected copy is from `epr-packaging-frontend` main (#358).

1. Sign in.
2. Open the year: through "Choose a year" with the flag on; the current year with the flag off.
3. Section text compared word for word with the expected variant; prints `MISMATCH` on any missing, extra or out-of-order line.
4. The other variant's lines are absent.
5. Progress table still shown (NO DATA YET vs calculated totals).
6. December waste details box (informational; MO-449 marks the clickable Details component out of scope). Expected only with the flag on, alternative content, a future year, a Dec/Jan clock and an awaiting two-year December Waste note.

Coverage used for MO-449 (7 Oct 2026, 62/62 PASS):

- **Flag on:** S2 with 2027 (AC1) and 2026 (AC2, partly calculated) for DRP and CS, plus a DRP Delegated Person; S3 with 2027 (AC1 for the current year) and 2026 (AC2, past year).
- **Flag off:** S3 and S2 (AC3), using an overlay that sets only `FeatureManagement__ShowMultiYearObligations: "false"`. Cell names get `-MYOFF`.

## MYDW-R: Research walkthrough

Follows the "Multi-Year and December Waste – June 2026" topic guide (Walt Buchan) on the real service:

- S1 tile
- S2 year selection
- S3 accept/reject list
- S4 year confirmation
- S5 success
- S6 bulk review
- C1 close

Each step prints the hypothesis, what to observe and the probes. Record the participant's words as `NOTE …`: these roll up under H1–H6 in SUMMARY.docx. Use `--dry-run` unless the session should accept a PRN. Use S1 or S2 so the December framing is realistic.
