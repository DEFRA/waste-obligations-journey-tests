# Test code conventions

How Playwright code is written in this repo. `eslint-plugin-playwright` (recommended rules, all errors) enforces the
mechanical part on every commit and PR; `/review-tests` checks the rest.

- **Locators:** `getByRole`, then `getByLabel` / `getByText`, then `getByTestId`; CSS only when none fits, and no
  XPath. `.first()` / `.nth()` only with a comment saying why the match isn't unique.
- **Waiting:** web-first assertions (`await expect(locator).toBeVisible()`) and `expect.poll` / `toPass` for retries.
  No `waitForTimeout`, no `networkidle`, no `isVisible()` used as a condition. `waitForURL` already waits for the
  page's load event.
- **Assertions:** every test asserts; helpers that assert are named `expect…` / `assert…` (or `…Flow`). An
  assertion never sits behind an `if`: assert the precondition, or `test.skip(condition, reason)`.
- **Branching:** none in a test body, except environment or entry-point routing (Packaging sign-in or direct CDP),
  which carries `// eslint-disable-next-line … -- <reason>`. Never disable a rule for a whole file.
- **Structure:** page objects in `pages/` extend `BasePage`; specs get them from `fixtures/pages.fixture.js`. Reuse
  what exists before adding a page object, helper or fixture.
- **Isolation:** each test stands alone. Serial mode and module-level `let` only with a comment saying why.
- **Environments:** URLs only through `utils/journey-entry-point.js`; credentials only through `requireEnv`. No hosts,
  org ids or emails in specs (they live in `data/`).
- **Data:** set up and check state through the API clients (`utils/waste-obligations-api.js`) rather than the UI;
  mark tests that change shared data and restore what they change.
- **Traceability:** the test or describe title carries the AC (`AC1 — …`) or ticket id (`MO-123`).
- **Layer:** a journey test proves a user journey or an integration. Field rules, calculations and edge cases belong
  in the service's unit or API tests; say so in the review rather than adding UI cases for them.
