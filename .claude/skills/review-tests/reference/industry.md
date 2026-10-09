# Industry practice (IN)

General test-engineering standards (ISTQB test design, the Google and Microsoft guidance on flaky tests, OWASP for
test code, WCAG 2.2 AA for accessibility) applied to this repo.

## Reliability

| Id    | Check                                                                                                                                                     | Usual severity |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| IN-01 | **Deterministic.** No dependence on today's date, random data or ordering without control (fixed year, sorted lists, seeded data, frozen clock on LOCAL). | blocker        |
| IN-02 | **Flake sources.** Races with navigation, animations, eventual consistency (sync to the PRN database, queues): wait on the real signal, with a bound.     | should-fix     |
| IN-03 | **Retries don't hide bugs.** Retry loops are bounded, log each attempt, and only wrap the unstable step, never the assertion.                             | should-fix     |
| IN-04 | **Clean up.** Data a test changes is restored (LOCAL restore, tst reset) in a `finally` or `afterEach`, so a failure doesn't poison the next run.         | should-fix     |

## Security

| Id    | Check                                                                                                                                           | Usual severity |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| IN-05 | **No secrets.** No passwords, tokens, keys or connection strings in code, data, logs, screenshots or transcripts; `requireEnv` for credentials. | blocker        |
| IN-06 | **Least privilege.** Tests use the role the journey needs; admin or regulator accounts only for their own steps.                                | suggestion     |
| IN-07 | **No personal data.** Test data is synthetic; no real people's names, emails or addresses.                                                      | blocker        |

## Accessibility

| Id    | Check                                                                                                              | Usual severity |
| ----- | ------------------------------------------------------------------------------------------------------------------ | -------------- |
| IN-08 | New or changed pages are scanned with axe (`tests/accessibility-checking.js`) and pass WCAG 2.2 AA.                | should-fix     |
| IN-09 | Role-based locators double as an accessibility check: a control only findable by CSS is worth raising as a defect. | suggestion     |

## Maintainability

| Id    | Check                                                                                                                                                          | Usual severity |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| IN-10 | **DRY, but readable.** Repeated sequences become a page-object method or helper; a test still reads as the journey (arrange, act, assert visible at a glance). | should-fix     |
| IN-11 | **Naming.** Files, tests, steps and helpers say what they do; no `test2`, `tmp`, `foo`; constants named for their meaning.                                     | suggestion     |
| IN-12 | **Comments explain why**, not what; no commented-out code; TODOs carry a ticket id.                                                                            | suggestion     |
| IN-13 | **Size.** A spec over ~500 lines or a test over ~80 lines is split by journey or behaviour.                                                                    | suggestion     |
| IN-14 | **Dependencies.** New packages are needed, pinned (`--save-exact`), and not duplicating one the repo has.                                                      | should-fix     |

## Reporting

| Id    | Check                                                                                                                        | Usual severity |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | -------------- |
| IN-15 | Failure messages say what was expected and why (`expect(x, 'message')`), so a report is readable without the code.           | suggestion     |
| IN-16 | Skips carry a reason that names the condition (`test.skip(cond, 'FEATURE_X is off')`) and show in the skipped-tests report.  | should-fix     |
| IN-17 | Test design techniques fit the change: equivalence classes and boundary values for inputs, state transitions for lifecycles. | suggestion     |
