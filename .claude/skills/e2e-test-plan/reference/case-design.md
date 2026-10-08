# Designing the cases

Lessons from building the MY&DW release plan (epics MO-31, MO-65, MO-106). Read the domain rules in
`.claude/rules/` first: they hold the obligation-year, December Waste and CSoC behaviour the cases rely on.

## From Jira to cases

- **Every child item gets a row in the coverage table**: covered by named cases, or listed under "Not tested" with a
  reason (spike, user research, content or design work, Closed, Not Needed, duplicate).
- **One behaviour per case.** Split a story's ACs across cases when they need different users, dates or data; merge
  ACs from different stories into one case when the same steps prove them. List every story/AC a case proves on its
  **Stories:** line.
- **Quote the copy.** Expected copy comes from the ACs (and the Figma frames they link); mark dynamic parts
  ("year and date are dynamic").
- **Test what was built, flag what was asked.** When the ACs, the scope document and the app disagree, write the case
  against the agreed behaviour and add an open question (Q1, Q2 …) rather than guessing. Don't add cases for
  behaviour the user rules out of scope; mark it in the scope table instead.
- **Read the epics' own descriptions** and any scope or product-definition document the user gives: they hold
  requirements no single story has (auditing, reporting, unhappy paths). Map each scope item in the scope table.

## Where a case runs

| Needs                                                                      | Part                   |
| -------------------------------------------------------------------------- | ---------------------- |
| Today's real date and data that exists on tst                              | A: TST                 |
| Another date (December/January window, 1 February, a deadline), a boundary | B: LOCAL, time-shifted |
| A feature flag switched off                                                | B: LOCAL               |
| Data that can't be arranged on tst (seeded notes, edge cases)              | B: LOCAL               |
| Another system: RREPW, admin portal, Approve & Monitor, Power BI, inboxes  | C: manual on tst       |

- Name the **scenario** (frozen clock) for each LOCAL case, and add boundary scenarios: the last second before a
  change and the first second after. Add one a year on to catch hard-coded years.
- Automate everything that can be automated; keep only the cross-system journeys manual.
- If a case can only be valid in one environment (e.g. it needs current-year notes of both types), say so in the case.

## What every relevant case checks

- **Each user type and role that behaves differently:** DRP and CS, approved, delegated and basic users (basic:
  read-only, no action controls).
- **After any change of state (accept, reject, submit, cancel):** the confirmation page, the item's status on every
  page that shows it (detail, list, search), the totals it affects (obligations table: Totals, material row, awaiting
  count, in every year it counts towards), downloads (PDF, CSV), and the audit trail (status, year, user) in the
  database where it can be reached.
- **Negative and unhappy paths:** nothing selected, not allowed (wrong role, closed year, after the deadline), items
  that must not show an action or tag.
- **Feature flags off:** the legacy behaviour is unchanged.
- **Welsh:** the new screens, when the translation story is in scope.
- **Regression of existing behaviour** the release touches (e.g. standard accept/reject), marked as regression.

## Data and safety

- Say in "Accounts and data" exactly what data each environment needs, and how LOCAL is seeded and restored.
- Mark cases that change data. On LOCAL, restore after each one. On tst, the user must agree before data is changed
  or reset.
- Cross-system journeys start with "Before you start: note …" so the expected results can use the recorded values.
