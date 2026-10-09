# Test strategy: pyramid and shift-left (TP, SL)

This repo holds **journey tests**: the top of the pyramid. They are the slowest and most expensive tests the
programme runs, so each one must earn its place.

## Test pyramid (TP)

| Layer                  | Where                                                         | Proves                                                             |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| Unit                   | the service repo (and `unit-tests/` here, for our own utils)  | rules, calculations, validation, mapping, edge cases               |
| API / contract         | the service repo; here via `utils/*-api.js` when cross-system | endpoint behaviour, status codes, payloads, auth, sorting, paging  |
| Journey (UI E2E), here | `tests/*.spec.js`                                             | a user can complete the journey across services; key states render |

| Id    | Check                                                                                                                                                       | Usual severity |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| TP-01 | **Right layer.** A UI test for a rule, calculation or validation permutation belongs lower: say which repo and layer, and keep one UI case for the journey. | should-fix     |
| TP-02 | **No duplication.** The same behaviour isn't asserted again at a higher layer when a lower one already proves it (check the service PR's tests).            | suggestion     |
| TP-03 | **API before UI** for setup, state checks and permutations (`utils/waste-obligations-api.js`); the UI part proves only what the user sees and does.         | should-fix     |
| TP-04 | **Unit tests for test code.** New non-trivial helpers in `utils/` (parsing, date rules, matching) get a `unit-tests/*.test.js`.                             | suggestion     |
| TP-05 | **Cost.** New UI tests multiply by browser projects (six in `playwright.config.js`) and profiles: a case that adds minutes needs a reason.                  | suggestion     |

## Shift-left (SL)

| Id    | Check                                                                                                                                                        | Usual severity |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| SL-01 | **Tests with the change.** The journey test lands with, or before, the service PR it covers, not after release; the PR links the ticket.                     | should-fix     |
| SL-02 | **Testable ACs.** ACs that can't be turned into a pass/fail check (vague, untestable copy, no data) are raised on the ticket before testing, as questions.   | should-fix     |
| SL-03 | **Runs in the pipeline.** The spec is in a `PROFILE` (`playwright.config.js`) and can run in CI (`journey-tests.yml`) or CDP Portal, not only by hand.       | should-fix     |
| SL-04 | **Runs locally.** The test works against the local stack (`ENVIRONMENT=local`, `npm run test:local`) so developers can run it before merging.                | suggestion     |
| SL-05 | **Own data.** The test creates or seeds what it needs through APIs or local seeds instead of relying on whatever is on tst.                                  | should-fix     |
| SL-06 | **Fast feedback first.** Lint, unit and API checks catch problems before the journey run; nothing in the diff weakens a gate (disabled rule, skipped check). | blocker        |
| SL-07 | **Non-functional early.** New pages are included in the accessibility and security profiles (`accessibility.spec.js`, `security.spec.js`).                   | should-fix     |
| SL-08 | **Flags.** Behaviour behind a feature flag is testable both ways now, so switching the flag on later isn't the first test.                                   | suggestion     |
