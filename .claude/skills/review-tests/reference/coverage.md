# Scenario coverage for the ticket (COV)

Judges whether the change tests what the ticket asks, using the case-design guide in
`.claude/skills/e2e-test-plan/reference/case-design.md` and the domain rules in `.claude/rules/` (read them; don't
copy them here).

## Method

1. **List the behaviours.** From the ticket's ACs (`jira-read issue <KEY>`), and from what the service PRs actually
   changed (`qa-ticket/pr-status.mjs <KEY>`, then `gh pr diff <n> -R <repo>`). A behaviour the PR changed but no AC
   mentions is a question for the user, not an assumption.
2. **Map each to a test.** For every AC: the test (file:title) and step that proves it, in this diff or already in
   the repo (`grep` the AC wording and the page or endpoint). Mark it **covered**, **partly** (say what's missing)
   or **missing**.
3. **Check the matrix** each behaviour needs (below). A gap is a finding only when the ticket or the domain rules make
   that variation matter.
4. **Say where the missing case belongs:** TST, LOCAL (time-shifted, flags off, seeded data), manual (another
   system), or a lower layer (see `strategy.md`).

## Checks

| Id     | Check                                                                                                                                    | Usual severity |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| COV-01 | Every AC maps to at least one test step that would fail if the AC were broken (not just a page load).                                    | blocker        |
| COV-02 | Expected copy is quoted from the AC (or Figma it links), with dynamic parts marked; no expectation invented beyond the AC.               | should-fix     |
| COV-03 | Each user type and role that behaves differently: DRP and CS; approved, delegated and basic (basic: no action controls).                 | should-fix     |
| COV-04 | Negative and unhappy paths: nothing selected, wrong role, closed year, after the deadline, invalid input, not found, service error.      | should-fix     |
| COV-05 | After a state change (submit, accept, reject, cancel): confirmation, status on every page that shows it, totals, downloads, audit trail. | should-fix     |
| COV-06 | Boundaries: dates and windows (December Waste, 31 January, 1 February), first and last page, empty and full lists; LOCAL scenario named. | should-fix     |
| COV-07 | Feature flags: behaviour with the flag on, and the legacy behaviour unchanged with it off.                                               | should-fix     |
| COV-08 | Welsh, when the translation is in the ticket's scope; accessibility (axe) for new or changed pages.                                      | should-fix     |
| COV-09 | Regression: existing behaviour the change touches still has a test.                                                                      | suggestion     |
| COV-10 | Traceability: test or describe titles carry the AC or ticket id, so the coverage matrix can be rebuilt from the code.                    | suggestion     |

## Output

A matrix, one row per AC or behaviour: `AC | covered by (file:title › step) | status | gap and where it belongs`.
