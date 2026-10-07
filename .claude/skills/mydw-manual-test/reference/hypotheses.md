# Research hypotheses → screens → journeys

Source: "Multi-Year and December Waste – June 2026" topic guide (Walt Buchan). The guide was written for a
prototype set in December 2026. Use scenario S1 or S2 so the live service matches that framing.

| Id  | Screen               | Hypothesis (short)                                                                     | Live route                                                  | Journey steps                           | What the live service does today (Oct 2026, local)                                                                                                                                                                                        |
| --- | -------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | 1 Dashboard tile     | The C deadline framing suppresses the "by year" signal, causing a micro-break          | `/report-data` (home-self-managed / home-compliance-scheme) | MYDW-01 #02, MYDW-R S1                  | Tile body: "View or manage your recycling obligations by year…" followed by the C certificate/statement deadline sentence                                                                                                                 |
| H2  | 2 Year selection     | First-time users do not understand why C+1 is offered                                  | `choose-your-recycling-obligations-year`                    | MYDW-01 #03 #05, MYDW-R S2              | "Choose a year": bare radios C+1/C/…/2025, no hint or explanation                                                                                                                                                                         |
| H3  | 3 Accept/reject list | Reject is not discoverable from the list                                               | `view-awaiting-acceptance-alt`                              | MYDW-03 #07 #08, MYDW-07 #03, MYDW-R S3 | The list's only call to action is "Accept selected PRNs and PERNs". Reject is mentioned only in the intro text and is available on each PRN page.                                                                                         |
| H4  | 4 Year confirmation  | Binary question with unequal options causes decision paralysis                         | `choose-acceptance-year/{id}` → `accept-prn/{id}`           | MYDW-04 #06 #07, MYDW-R S4              | Year page, then "Are you sure… towards your Y…?" with "Yes, accept" / "No, go back". No third "go to accept or reject for C" option, unlike the prototype. "No, go back" goes to the PRN page, and re-accepting silently reuses the year. |
| H5  | 5 Success            | Users need to verify on the obligations grid; "view <Y> obligations" should be primary | `accepted-prn/{id}`, `accepted-prns`                        | MYDW-04 #09–#11, MYDW-06 #08, MYDW-R S5 | Two buttons: "Accept or reject more PRNs and PERNs" and "View recycling obligations progress". The latter opens the session year, **not** the year just accepted into.                                                                    |
| H6  | 6 Bulk flow          | Splitting review and confirmation, plus ambiguous navigation, raises error risk        | list → `accept-bulk` → `accepted-prns`                      | MYDW-06 #04–#07, MYDW-R S6              | Review page with per-PRN "Remove from selection" and a single "Accept" that commits. There is no separate confirmation page, and no year is shown.                                                                                        |

## Capturing observations

- Reply `NOTE <participant quote or behaviour>` on hypothesis-tagged steps. Verdict mapping:
  - **PASS + note:** the hypothesis was not supported, or there was no issue.
  - **FAIL + reason:** the problem predicted by the hypothesis was observed.
- `SUMMARY.docx` groups every note by H1–H6 across all cells.
- Also capture the moderator-note behaviours:
  - verification attempts (navigating away to check an outcome);
  - the participant's own words for the task;
  - whether a problem is interface-level or conceptual;
  - whether the participant has had December Waste PRNs before.
