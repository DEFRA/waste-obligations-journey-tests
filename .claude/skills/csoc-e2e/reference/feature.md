# CSoC feature reference for csoc-e2e

Built from the Confluence CSoC initiative pages on 8 Oct 2026. `.claude/rules/csoc.md` has the always-loaded
summary; this file is the detail the skill checks against. When a page changes, re-read it:

```
node .claude/skills/confluence-read/confluence.mjs page <id>
```

Then update this file. Page versions are listed under Sources.

## Journeys and what each must show

From **CSoC end-to-end test scenarios - Oct Release** (page `6601703705`). Every journey runs once per regulator ×
organisation type. One scenario runs in Welsh.

| Journey                                   | Producer side                                                                                                                                 | Regulator side                                                                                                                                                                                           | Public register                                                              | Runner                                                               |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| E2E-00 No submission                      | -                                                                                                                                             | Organisation in the **Not submitted** list. DRP: % met shown and matching Meet Obligations. CS: no percentages                                                                                           | Blank                                                                        | Scaffolded (fixme)                                                   |
| E2E-01.1 DRP happy path                   | Sign in → open the certificate → review the totals → **no Reg 43 checkbox** → declaration → submit → **Submitted** → confirmation email → PDF | Sees the submitter's name, time and totals. Shown as DRP. % met matches Meet Obligations. Approve → **Accepted**. Audit entry for the regulator user and time, also visible against the organisation     | "Submitted", then "Approved" after acceptance                                | `submit`, `approve`                                                  |
| E2E-01.2 CS compliant                     | Totals **MET**. **Reg 43 checkbox shown**, YES → submit → Submitted → email → PDF                                                             | Shown as CS with no %. Reg 43 shown as YES. Approve → Accepted. Audit entry                                                                                                                              | Before acceptance: both columns blank. After: **Reg 40 = Met, Reg 41 = Yes** | `submit`, `approve`                                                  |
| E2E-01.3a CS                              | MET, Reg 43 **NO**                                                                                                                            | As E2E-01.2                                                                                                                                                                                              | After acceptance: Reg 40 = Met, Reg 41 = No                                  | `submit`, `approve`                                                  |
| E2E-01.3b CS                              | NOT MET, Reg 43 YES                                                                                                                           | As E2E-01.2                                                                                                                                                                                              | Reg 40 = Not met, Reg 41 = Yes                                               | **Not in the runner** (needs a NOT MET CS seed)                      |
| E2E-01.3c CS                              | NOT MET, Reg 43 NO                                                                                                                            | As E2E-01.2                                                                                                                                                                                              | Reg 40 = Not met, Reg 41 = No                                                | `submit`, `approve` (the MET/NOT MET seed is outside the runner)     |
| E2E-02 Delegated person                   | A delegated person submits; the **typed name** is stored; the submitter gets the email                                                        | Sees the typed name as submitter. Approve. The audit keeps the original submitter                                                                                                                        | -                                                                            | Scaffolded                                                           |
| E2E-03 Basic user                         | Can view a submitted CSoC, with **no submit, edit or resubmit** controls                                                                      | -                                                                                                                                                                                                        | -                                                                            | Scaffolded                                                           |
| E2E-04 Cancel and resubmit                | Sees **Cancelled** → resubmits → Submitted → a fresh email                                                                                    | Cancel with a reason, confirm on the warning screen → Cancelled. Audit has user, time and reason. Cancellation email to the organisation. History: **Cancelled then Submitted**, each with its own audit | Blank after cancellation and after resubmission                              | `submit`, `cancel`, `resubmit`, `view-history`                       |
| E2E-05 Eligibility gate                   | No obligations (POM not approved or calculation not run): **no CSoC tile**. Once totals exist, the tile shows and the submission works        | Not shown as submittable, then "Submitted"                                                                                                                                                               | -                                                                            | Scaffolded (needs a seed)                                            |
| E2E-06 Resubmission blocked               | No resubmit while Submitted or Accepted                                                                                                       | Repeated Approve or Cancel: **exactly one** status change and audit entry, and the current status comes back with no error                                                                               | -                                                                            | Scaffolded                                                           |
| E2E-07 Welsh                              | Every producer page in Welsh                                                                                                                  | Reaches Approved                                                                                                                                                                                         | -                                                                            | Scaffolded. Emails: NRW gets English and Welsh, the rest English     |
| E2E-08 Approve, cancel, resubmit, approve | Resubmits after the cancellation                                                                                                              | Accept → cancel (at the producer's request) → accept again. History: **Accepted, Cancelled, Accepted**                                                                                                   | Approved → blank → Approved                                                  | `submit`, `approve`, `cancel`, `resubmit`, `approve`, `view-history` |
| E2E-09 Deadline                           | From 1 Feb 2027, the user can't submit                                                                                                        | -                                                                                                                                                                                                        | -                                                                            | LOCAL only (time shift)                                              |

Notes:

- **"Approved" means Accepted:** the scenarios say "Approved"; the API and data use `Accepted` (`DECLARATION_STATUS`
  in `data/csoc.data.js`).
- **The public register isn't checked:** register updates are post-MVP (pushed from Synapse, decision tracker), so the
  runner doesn't verify them. Report them as manual / pending, never as passed.
- **Email wording isn't asserted:** the pack captures the emails as evidence, and the reviewer checks the content
  against the agreed templates.

## Rules the checks rely on

- **Producer statuses:** Not submitted, Submitted, Cancelled. Producers don't see Accepted in MVP.
- **Transitions:** Submitted → Accepted, Submitted → Cancelled, Accepted → Cancelled. Resubmission only from Cancelled.
- **Cancellation reasons:**
  - the name doesn't match the approved or delegated person;
  - the obligations changed;
  - submitted as not met while there's still time to buy PRNs/PERNs;
  - requested by the producer or scheme.
- **What's frozen at submission:** the obligation totals as shown (held in Redis, so a backend recalculation after the
  page loaded isn't submitted), the organisation details, and the declaration text version.
- **Rebuilt, not stored:** the certificate is rebuilt from the data, and the PDF must match what was submitted.
- **Declaration text:** lives in frontend code, in English and Welsh. Old CSoCs must keep the text they were
  submitted with.
- **Who can submit:** only approved or delegated persons. The name is free text. The content says it must match the
  account name, which is shown as "Name on account"; a mismatch is a cancellation reason, not a validation error.
- **CS declaration:** the Reg 43 question appears only for a CS. A CS statement is compliant only when MET and Reg 43
  is YES.
- **Eligibility:** submission is exposed only when all POMs are approved, so obligation totals are present.
  Organisations with no approved or delegated person can't submit anything.
- **Emails:**
  - **Submitted:** to the logged-in user.
  - **Cancelled:** with the reason.
  - **Accepted:** none.
  - **Bilingual:** for organisations whose country is Wales, English first.
  - **Reminders:** 1 Dec to non-submitters, and Mondays in January to producers that met their obligations but
    haven't submitted.
- **No data yet** (CDP CSoC table): "-" in columns 2 and 5 with "No data yet". A material under 1 tonne shows 0 with
  "Met".
- **Content:**
  - regulator named, with its contact email;
  - "Natural Resources Wales" without "the";
  - "approved or delegated person", "recycling obligations", "regulation 43";
  - "You may face enforcement action if you miss this deadline";
  - no "obligation year".

## Pages and APIs

- **Producer pages** (`waste-obligations-frontend`, through the Packaging sign-in):
  - `/producer/{organisationId}/compliance/certificate?year=Y` (About)
  - `…/certificate/submit?year=Y` (Check and submit)
  - `…/certificate/{declarationId}/success`
  - `…/certificate/{declarationId}` (View)
  - CS: `/cso/{schemeId}/compliance/statement…`
- **Waste Obligations API** (OpenAPI at `https://waste-obligations.api.dev.cdp-int.defra.cloud/documentation`):
  - `GET /organisations/{organisationId}/obligations`
  - `POST /organisations/{organisationId}/compliance-declarations`
  - `GET /organisations/{organisationId}/compliance-declarations?obligationYear=Y`
  - `GET /organisations/{organisationId}/compliance-declarations/{id}`
  - Regulator list: `GET /compliance-declarations?year=Y&status=…` (paged, with % accepted per obligation for
    sorting)
  - Status change: `PATCH` with `Status` (Accepted | Cancelled), `User` (id, email, name) and `CancelledReason`. It
    writes the audit trail.
- **Data:** MongoDB `ComplianceDeclaration` collection, synced to Synapse through an outbox and queue (ADR-150).
  `utils/waste-obligations-api.js` already wraps the GET by year and the status `PATCH`, so reuse it rather than
  calling the API by hand.

## Scope

- **MVP:** everything above, plus:
  - the cookie information page (no cookie banner);
  - Grafana counts of Submitted, Accepted and Cancelled.
- **Future, not to be tested as missing:**
  - an Accepted status or email for producers;
  - cancellation comments in the email;
  - automated cancellation;
  - producer self-cancel;
  - previous years' certificates (Multi-Year);
  - job title on the declaration;
  - regulators seeing up to 7 previous years.
- **Out of scope:** storing certificates as PDFs, web analytics, NPWD certificates.

## Open questions (as of 8 Oct 2026)

Raise them rather than guessing:

- **Q181:** can a cancelled submission be resubmitted after 31 January?
- **Q173:** how acceptance works per regulator (EA historically auto-accepted DPs).
- **Q147:** what happens to CSoCs when obligations are recalculated in January? Treated as a manual process for now.
- **Q110 / Q169:** public register population and what "satisfactory" means.
- **Reminder email timing:** the 1 January MET email (product definition) and every Monday in January (email
  content page) disagree. Confirm before testing reminders.

## Sources

| Page                                                  | Id                                   | Version read     |
| ----------------------------------------------------- | ------------------------------------ | ---------------- |
| Product Definition & Scope (CSoC for DPs & CSs)       | 6465718692                           | v74, 8 Oct 2026  |
| CSoC end-to-end test scenarios - Oct Release          | 6601703705                           | v1, 18 Sep 2026  |
| CSoC end-to-end test scenarios - First-cut            | 6529320681                           | v31, 5 Oct 2026  |
| Content design: CSOC for DPs and CSs                  | 6486329962                           | v12, 14 Jul 2026 |
| Content agreed with regulators for system sent emails | 6548553856                           | v2, 22 Jul 2026  |
| CSoC Technical Design                                 | 6463684694                           | v45, 8 Jul 2026  |
| CSoC - Draft Technical Design - Regulator             | 6505662785                           | v8, 22 Jul 2026  |
| Storing submission of CSoC                            | 6507627058                           | v3, 29 Apr 2026  |
| Decision Tracker for CSoC                             | 6547767676                           | v13, 4 Aug 2026  |
| CSoC Questions & Answers / Regulator Questions        | 6461489349 / 6472728985              | v42 / v7         |
| CSoC - MI & Reporting requirements                    | 6511532709                           | v6, 3 Jun 2026   |
| ADR-146 (CSoC on CDP)                                 | 6470140420                           | v22, 15 Jun 2026 |
| Accessibility / Security / Device compatibility tests | 6539446195 / 6539314313 / 6535684084 | Jun 2026         |
| Glossary                                              | 6515396993                           | v3               |
