# Testing lessons and conventions

## What to check

- After an accept or reject, check the **obligations table** (Totals and the material row, in every year the note
  counts towards), the **awaiting count**, the **accept/reject list** and the **search status**, not just the
  success banner. Check the database status and audit row where it can be reached.
- Multi-select of December Waste notes with a choice of year is not allowed by design; bulk-accept cases need
  standard (or single-year) current-year notes.
- The PRN PDF is an image; check the HTML it is drawn from (`download-*-pdf/{id}`), not the PDF file.
- A case is only valid where its preconditions can exist: December/January, 1 February and flags-off cases belong
  on LOCAL; cross-system cases (RREPW, admin portal, Power BI) are manual on tst.

## Running

- The user wants everything that can be automated to be automated; only cross-system journeys stay manual.
- A recreated frontend can be slow: retry sign-in and wait for the page heading before reading the page.
- Changing scenario or flags recreates the frontend. After stopping a run part-way, restore the clock
  (`gather.js --scenario …`) and the data (`gather.js --restore`).
- Re-test before reporting: an issue seen once on tst (K21) was gone the next day. When the user challenges an issue,
  retest with a video and screenshots, and give the precondition that reproduces it.

## Outputs

- Test plans, results and issue lists live in the gitignored `evidence/` folder and go to Confluence, not the repo.
- Results tables for Confluence: produce **HTML**, not Markdown (Markdown tables with `<br>` break when pasted).
  Columns: Scenario ID, Steps, Evidence, Result (PASS/FAIL). Keep a blank copy (empty Evidence and Result).
- Issues need short steps to reproduce, expected vs actual, where (env, scenario, account) and the evidence path.
