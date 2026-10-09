# Playwright practice (PW)

Checked against the Playwright best-practices guide (playwright.dev/docs/best-practices), `eslint-plugin-playwright`
and this repo's `.claude/rules/test-code-conventions.md`. Lint already fails on the mechanical cases; the review adds
what lint can't see: intent, robustness and fit with the existing code.

| Id    | Check                                                                                                                                                                         | Usual severity |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| PW-01 | **User-facing locators.** `getByRole` / `getByLabel` / `getByText` first; `getByTestId` when copy is unstable; CSS only when nothing user-facing fits; never XPath.           | should-fix     |
| PW-02 | **Unique by design.** `.first()` / `.nth()` / `.last()` hide ambiguity: scope the locator (`within a row`, `filter({ hasText })`) or comment why order is the contract.       | should-fix     |
| PW-03 | **Web-first assertions.** `await expect(locator).toHaveText()` etc., not `expect(await locator.textContent())`. Missing `await` on an async `expect` is a blocker.            | blocker        |
| PW-04 | **No hard or network waits.** No `waitForTimeout`, `networkidle`, `setTimeout` sleeps; wait for the element, URL or response that matters, or `expect.poll` / `toPass`.       | blocker        |
| PW-05 | **No silent paths.** No `isVisible()` / `count()` used to decide whether to assert; no `try/catch` that swallows a failed check; no fallback that makes the test pass anyway. | blocker        |
| PW-06 | **No logic in tests.** Branching only for environment or entry-point routing, with a reasoned disable. Data-driven variation goes in a loop over `test()`, not inside one.    | should-fix     |
| PW-07 | **Isolation.** Tests don't depend on each other's order or state; serial mode and module-level `let` only with a stated reason; each test sets up what it needs.              | should-fix     |
| PW-08 | **Fixtures and page objects.** Use `fixtures/pages.fixture.js` and the `pages/` objects (extending `BasePage`); new pages get a page object, not raw locators in the spec.    | should-fix     |
| PW-09 | **Readable steps.** `test.step` names say what the user does; a test's title says the behaviour and the AC or ticket id.                                                      | suggestion     |
| PW-10 | **Soft assertions on purpose.** `expect.soft` only where later checks are still meaningful after a failure (e.g. a list of copy lines).                                       | suggestion     |
| PW-11 | **Timeouts.** Raise a timeout only with a comment saying why (slow environment hop, polling); never to hide slowness the test should report.                                  | should-fix     |
| PW-12 | **Network control.** Intercept (`page.route`) third-party traffic the test doesn't own (analytics, CDNs); never mock the service under test in a journey test.                | should-fix     |
| PW-13 | **API inside UI tests.** Use `request` / the API clients for setup and state checks; it's faster and less flaky than driving the UI to arrange data.                          | suggestion     |
| PW-14 | **Evidence.** Screenshots via `screenshotRecorder` at the states a reviewer needs; traces stay on (config); no screenshots of pages showing secrets.                          | suggestion     |
| PW-15 | **Disables.** Every `eslint-disable` is next-line, names the rule and gives a reason that is true. A file-wide disable is a blocker.                                          | blocker        |
