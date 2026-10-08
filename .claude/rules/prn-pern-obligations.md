# PRNs, PERNs and recycling obligations

What earlier sessions learnt while testing the Multi-Year Obligations and December Waste (MY&DW) release (epics
MO-31, MO-65, MO-106) in the Packaging frontend (`epr-packaging-frontend`, "RPD", under `/report-data`).
Confirm against the code before relying on a detail; the app is still changing.

## Vocabulary

- **Producer accounts:** a **DRP** (direct registered producer) meets its own obligations; a **CS** (compliance
  scheme) meets them for its members. Roles: **AP** approved person, **DP** delegated person, **BU** basic user.
- **PRN:** Packaging waste Recycling Note, issued by a UK reprocessor. **PERN:** the export equivalent, issued by an
  exporter (`Prn.IsExport = 1`; its detail page heading says "Export"). The app treats both as "notes"; most copy
  says "PRNs and PERNs".
- **Issuing systems:** **RREPW** issues the current notes (numbers like `…-RREPW`); **NPWD** is the legacy system
  (2025 notes). Issuers can cancel a note in RREPW; the regulator can cancel one in the admin portal. Power BI
  reports read the same PRN data.
- **CSoC:** certificate (DRP) or statement (CS) of compliance, due on or before 31 January after the year.

## Years

- **Compliance year C runs February to January** (UK time): January belongs to the previous year. In January 2027,
  C = 2026; from 1 February 2027, C = 2027. The deadline for year Y is 31 January Y+1.
- Each note has an **ObligationYear** P. Accepting a note writes the year it was accepted into back to
  `Prn.ObligationYear`.
- **Standard note:** can be accepted only into P, and only while P = C.
- **December Waste note** (`Prn.DecemberWaste = 1`, waste from December counted towards either year): while
  awaiting and P ≤ C (P > C gives nothing), the first matching rule wins:
  1. P = 2025 and C is 2025 or 2026: `[C]`.
  2. now is before 1 Feb P+1: `[P, P+1]` (a choice of year).
  3. P+1 = C: `[C]`.
  4. otherwise expired.
- The port of these rules is `.claude/skills/mydw-manual-test/scripts/lib/rules.js`. Use it to compute
  expectations rather than re-deriving them.
- **Blue tag** "Can be accepted towards Y[ or Y+1] recycling obligations": December Waste, awaiting, at least one
  year available, today in December or January, and issued between 1 Dec and 31 Jan of that window.
- **"Choose a year"** (`/report-data/choose-your-recycling-obligations-year`) offers C+1, C, C-1 … 2025. The chosen
  year is held in session and drives the obligations page and the "View recycling obligations progress" link.
  2025 opens the historic "Your … record for 2025" page.

## How obligations are met (the obligations page)

`/report-data/manage-your-recycling-obligations`, "Manage your Y recycling obligations":

- A table with one row per material (Aluminium, Glass, Paper/board/fibre, Plastic, Steel, Wood; Glass splits into
  re-melt and other) plus a **Totals** row. Columns: obligation to meet, tonnage **awaiting acceptance**, tonnage
  **accepted**, tonnage outstanding, and a status. Each material name links to its own page. Paper/board and Fibre notes both land on "Paper, board or fibre-based
  composite material".
- "Number of PRNs and PERNs awaiting acceptance N" sits below the table.
- If obligations aren't calculated for Y (e.g. a future year), the table says "Not available yet" and shows only
  awaiting and accepted tonnage.
- **Awaiting tonnage counts every note that could still go into Y.** A December Waste note with a choice of year is
  counted as awaiting in **both** years. The page explains this in "Why does the recycling obligations table already
  have tonnage awaiting acceptance?".
- **Accept into Y:** in Y, the note's tonnage moves from awaiting to accepted (Totals and its material row) and the
  awaiting count drops by 1. For a December Waste note, the other year's awaiting tonnage and count drop too.
- **Reject:** awaiting tonnage and count drop (in both years for December Waste); accepted is unchanged. The note
  leaves the accept/reject list and shows REJECTED on the search page.
- **Cancel** (issuer in RREPW, or the admin portal) sets the note to CANCELLED (3); its tonnage should come off the accepted total.
- The CSV link ("Download a list of all PRNs and PERNs for Y") gives a file, or, with no notes, a page saying "You
  have no PRNs or PERNs issued to your Y recycling obligations." It is meant to be per year (it currently isn't: K17).

## Journeys and pages

| Page                                               | Path under `/report-data`                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Accept or reject list (awaiting only, 10 per page) | `view-awaiting-acceptance-alt`                                                               |
| Search all PRNs and PERNs (last column is status)  | `view-awaiting-acceptance?search=<number>`                                                   |
| Note detail (Accept / Reject this PRN or PERN)     | `selected-prn/{id}`                                                                          |
| Choose a year to accept into (two-year notes only) | `choose-acceptance-year/{id}`                                                                |
| Confirm accept ("Yes, accept")                     | `accept-prn/{id}`                                                                            |
| Reject ("Yes, reject")                             | `reject-prn/{id}`                                                                            |
| PDF content (the PDF is drawn as an image from it) | `download-selected-prn-pdf/{id}`, `download-accepted-prn-pdf/{id}` (JSON with `htmlContent`) |
| Language switch                                    | `culture?culture=cy\|en&returnUrl=~/<path>`                                                  |

- A note with **one** available year has a checkbox for **bulk accept** (always into C, no year confirmation, K8).
  A note with **two** years has no checkbox and goes through the year page. A note with none shows no actions.
- Reject is only offered on the note's detail page, not on the list.
- After accepting, the banner says "You accepted this PRN towards your Y recycling obligations". Search statuses
  read ACCEPTED, AWAITING ACCEPTANCE, REJECTED (and CANCELLED).

## PRN database

`Prn` (`Id`, `PrnNumber`, `ExternalId`, `OrganisationId`, `PrnStatusId`, `ObligationYear`, `DecemberWaste`,
`IsExport`, `TonnageValue`, `MaterialName`, `IssueDate`, `StatusUpdatedOn`) and `PrnStatusHistory`
(`PrnIdFk`, `PrnStatusIdFk`, `ObligationYear`, `CreatedByUser`, `CreatedByOrganisationId`, `CreatedOn`,
`Comment`). Every accept or reject adds a history row (the audit trail).

- **Status ids:** 1 ACCEPTED, 2 REJECTED, 3 CANCELLED, 4 AWAITING ACCEPTANCE.
- **Owner:** `OrganisationId` is the producer's organisation id; on tst a compliance scheme's notes are under its
  `complianceSchemeId`. Query both.
- **LOCAL:** `EprPrnBackend` in the `sqledge` container, via `mydw-manual-test` `lib/db.js` (snapshot, restore, seed).
- **tst:** `tst1_prn`, via `.claude/skills/mydw-e2e/prn-db.mjs`, SELECT only apart from the reset to
  awaiting (`UPDATE Prn SET PrnStatusId = 4 WHERE OrganisationId IN (…)`). Credentials come from `.env` or
  `../epr-playwright-bdd/features/ENV/.env.tst`. **Never print them.**
