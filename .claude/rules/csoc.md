# CSoC (Certificate or Statement of Compliance)

A DRP (direct registrant large producer) submits a **Certificate of Compliance**; a CS submits a **Statement of
Compliance**. Each submission goes to one regulator under one regulation. The regulator reviews it in the
**Approve & Monitor** service.

**Lifecycle:** Submitted → Approved (or Accepted), or → Cancelled by the regulator with a reason, after which the
producer can resubmit. Resubmission is blocked while a submission is Submitted or Accepted. Repeating Approve or
Cancel must change the status and write an audit entry exactly once, with no error. After the 31 January deadline
(from 1 February Y+1) the year can no longer be submitted.

**Regulators** (each journey runs once per regulator × organisation type):

| Code | Regulator                              | Jurisdiction     | Regulator mailbox                            |
| ---- | -------------------------------------- | ---------------- | -------------------------------------------- |
| EA   | Environment Agency                     | England          | packagingproducers@environment-agency.gov.uk |
| NRW  | Natural Resources Wales                | Wales            | packaging@naturalresourceswales.gov.uk       |
| SEPA | Scottish Environment Protection Agency | Scotland         | producer.responsibility@sepa.org.uk          |
| NIEA | Northern Ireland Environment Agency    | Northern Ireland | packaging@daera-ni.gov.uk                    |

Producer emails come from `extended.producer.responsibility.for.packaging@notifications.service.gov.uk`. NRW
organisations get English and Welsh templates; the others get English only.

**What the regulator sees:** the submitter's name (for a delegated person, the name typed in the form), the
submission time and the declared totals. A DRP shows the percentage met per material, matching the Meet
Obligations page. A CS shows no percentages but shows its regulation 43 declaration.

**CS outcomes:** compliant only when obligations are MET **and** regulation 43 is YES. The other three combinations
(Reg 43 NO with MET, YES with NOT MET, NO with NOT MET) are non-compliant. The Reg 43 checkbox never shows for a DRP.

**Eligibility:** with obligations not calculated (POM not submitted or the calculation not run), the CSoC tile isn't
shown and the organisation isn't submittable on the regulator dashboard. It appears once the upstream data is
approved and the totals exist.

**CSoC E2E journeys** (run by the `csoc-e2e` skill; evidence is one Word pack per run plus the CSoC PDFs):

| Id       | Journey                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------- |
| E2E-01.1 | DRP happy path: submit, email, PDF; regulator approves; audit                                        |
| E2E-01.2 | CS compliant: MET + Reg 43 YES                                                                       |
| E2E-01.3 | CS non-compliant: 3a Reg 43 NO + MET, 3b YES + NOT MET, 3c NO + NOT MET                              |
| E2E-02   | Delegated person submits; the typed name is the submitter                                            |
| E2E-03   | Basic (non-delegated) user can view, with no submit, edit or resubmit controls                       |
| E2E-04   | Regulator cancels with a reason; cancellation email; producer resubmits; history shows both in order |
| E2E-05   | Eligibility gate: no tile until obligations are calculated                                           |
| E2E-06   | Resubmission blocked; repeated Approve or Cancel is idempotent                                       |
| E2E-07   | Welsh: every producer page in Welsh (NRW)                                                            |
| E2E-08   | Approve, cancel at the producer's request, resubmit, approve: history approved, cancelled, approved  |
| E2E-09   | Deadline: no submission on 1 Feb 2027 (LOCAL only, needs the time shift)                             |

These E2E ids are separate from the MY&DW release's E2E-01 to E2E-06.

**Decisions (CSoC decision tracker, signed off by Yulia Karabanovych, July 2026):**

- **Declaration text** is held in the frontend code, translated to the user's language when the CSoC is viewed. A
  historical CSoC must keep the text it was submitted against if the wording changes later.
- **No data:** the CDP CSoC tables show dashes in columns 2 and 5 with "No data yet"; under 1 tonne shows 0 with
  "Met". The current Packaging obligations page is not changing, so until alignment the two differ (0s rather than dashes) but
  keep the same statuses.
- **Reporting:** for MVP, Grafana tracks CSoCs Submitted (pending), Accepted and Cancelled. Trend analysis moves to the
  A&I tools later. Public Register data is pushed from Synapse after MVP (RT team).
- **Audit:** each CSoC holds an `audit` array of `{ user: { id, email }, timestamp, action }`, with `reason` on a
  cancellation (actions such as Submitted and Cancelled).
