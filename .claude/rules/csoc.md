# CSoC (Certificate or Statement of Compliance)

Distilled from the Confluence CSoC initiative (EDIA space, page `6461751479` and its children), read on 8 Oct 2026.
The `csoc-e2e` skill's `reference/feature.md` has the detail, the per-journey expected results and the page list.
Read a live page with `confluence-read` when the wording matters.

## What it is

- **The law:** under the 2024 Packaging Regulations, a **direct-registrant large producer (DRP / DP)** submits a
  **Certificate of Compliance** (regulation 41), and a **compliance scheme (CS / CSO)** submits a **Statement of
  Compliance** (regulation 56).
- **What it confirms:** whether the organisation met its recycling obligations for the previous calendar year.
- **When:** by **31 January** (for 2026, by 31 Jan 2027), to its own regulator (EA, NRW, SEPA or NIEA).
- **Who signs:** an approved or delegated person.
- **Where:** built on CDP (`waste-obligations-frontend` and `waste-obligations`). The regulator side is Approve &
  Monitor.
- **Not filtered by outcome:** a "Not met" submission is valid and expected. Organisations declare regardless of
  outcome.

## Producer side

- **When it shows:** the CSoC tile appears on Manage obligations only when all POMs are approved and obligation
  totals exist (the eligibility gate). Without them, no tile.
- **Pages:** About your 2026 certificate/statement → Check and submit (the whole certificate shown) →
  "You have submitted …" → view the certificate.
  - DRP: `/producer/{organisationId}/compliance/certificate?year=Y`, `/submit`, `/{declarationId}/success`,
    `/{declarationId}`.
  - CS: `/cso/{schemeId}/compliance/statement…`.
- **Submitting:**
  - the user types their **full name**;
  - a CS also declares whether it complied with all other **regulation 43** requirements;
  - only approved or delegated persons can submit, and basic users can only view.
- **Name check:** content design (Jul 2026) says the name must match the account name, and the page shows a "Name on
  account" field. The system doesn't block a mismatch; the regulator cancels for it.
- **Frozen at submission:** the totals the user saw (held in Redis), the declaration text and the details are locked.
  The certificate is rebuilt from the stored data, not stored as a PDF.
- **PDF:** downloadable straight after submission, whether or not the regulator has accepted it.
- **Producer statuses:** Not submitted, Submitted, Cancelled. Accepted isn't shown to producers in MVP.
- **Resubmitting:** only after a regulator cancellation. It's blocked while Submitted or Accepted.
- **After the deadline:** no submission from 1 February. Whether a submission cancelled after the deadline can be
  resubmitted is still an open question (Q181).
- **Obligations table:**
  - CDP shows "-" in columns 2 and 5 with "No data yet" when no POM data exists.
  - A material under 1 tonne shows 0 with "Met".
  - Statuses are Met / Not met.

## Regulator side (Approve & Monitor)

- **Lists:** organisations by status, including **Not submitted**.
- **Detail:** the submitter's name, submission time and declared totals. A DRP shows the % met per material,
  matching the Meet Obligations page. A CS shows no percentages but shows its Reg 43 answer.
- **Statuses in the system:** `Submitted`, `Accepted`, `Cancelled`. The test scenarios say "Approved" for Accepted.
- **Transitions:** Submitted → Accepted, Submitted → Cancelled, Accepted → Cancelled.
- **Cancelling:** the regulator picks one of four reasons:

  - the name doesn't match the approved or delegated person;
  - the obligations changed;
  - submitted as not met while there's still time to buy PRNs/PERNs;
  - requested by the producer or scheme.

  The reason is stored, and goes in the cancellation email.

- **Repeat clicks:** repeated Accept or Cancel must give exactly one status change and one audit entry, with no
  error.
- **Audit:** each change appends `{ user: { id, email }, timestamp, action[, reason] }` to the declaration's `audit`
  array. History shows every record in order (for example Cancelled then Submitted, or Accepted, Cancelled,
  Accepted).
- **No late submissions:** the concept doesn't exist. Non-submissions after the deadline are still shown.

## Emails (GOV.UK Notify, sender `extended.producer.responsibility.for.packaging@notifications.service.gov.uk`)

- **Submitted:** to the logged-in submitter only.
- **Cancelled:** to the organisation, with the reason and what to do next.
- **Accepted:** no email.
- **Welsh organisations** (country Wales) get one bilingual email, English first then Welsh. Others get English.
- **Reminders** (content agreed with regulators, Jul 2026): "2 months to go" on 1 December to producers that haven't
  submitted, and "now submit your certificate" every Monday in January to producers that have met their obligations
  but not submitted. The product definition says the second goes on 1 January to MET organisations; the email page
  is newer.

## Public register

- **What the scenarios check:** two columns.
  - **Reg 40**, "complied with recycling obligations": Met / Not met.
  - **Reg 41**, "submitted a certificate of compliance": Yes / No.
- **When they fill:** both stay blank while Submitted or after a cancellation, and fill when Accepted. For a CS, the
  Reg 41 column follows its Reg 43 answer.
- **Not in MVP:** the decision tracker says the register is fed from Synapse **after MVP** (RT team), so these checks
  are manual or pending.

## Content rules (agreed with Defra and the regulators)

- **Say:**
  - "approved or delegated person";
  - "recycling obligations";
  - "complying with the requirements of regulation 43";
  - "by 31 January";
  - "You may face enforcement action if you miss this deadline";
  - "organisation name".
- **Avoid:** "obligation year", "declared obligation", "sanctions".
- **Regulator names:** use the named regulator with its contact email, not "the environmental regulator". Write "the
  Environment Agency", "the Scottish Environment Protection Agency" and "the Northern Ireland Environment Agency" mid-
  sentence, but **Natural Resources Wales** never takes "the". No regulator logo.

## Test environments and evidence

- **Where it runs:** dev / test CDP (the frontend reaches `waste-obligations-frontend.<env>.cdp-int.defra.cloud`
  through the Packaging sign-in).
- **Journeys:** E2E-00 to E2E-09 (`CSoC end-to-end test scenarios - Oct Release`, page `6601703705`), each run per
  regulator × DRP/CS. These ids are separate from the MY&DW release's E2E-01 to E2E-06.
- **Earlier results:**
  - accessibility found 0 critical or medium issues (Jun 2026);
  - the ZAP baseline found 0 high, 1 medium (absence of anti-CSRF tokens) and 3 low;
  - device compatibility covers Windows, macOS, Android and iOS browsers.
