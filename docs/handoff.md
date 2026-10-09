# Meet Obligations QA: handoff

_Last touched: 8 Oct 2026_

## Current state

`feat/claude-knowledge` (not pushed) holds the Claude setup for this repo:

- `CLAUDE.md` and the domain rules in `.claude/rules/`;
- the shared skills: `jira-read`, `jira-write`, `confluence-read`, `evidence-report`;
- the testing skills: `qa-ticket`, `e2e-test-plan`, `brief`, `handoff`, `security-impact-assessment` and
  `wiki-lookup`;
- the suites copied from `feat/manual-test-skills` (`mydw-e2e`, `csoc-e2e`, `unsubmitted-orgs`; `mydw-manual-test` was dropped on 9 Oct 2026, its LOCAL stack tools now in `mydw-e2e/local/`).
  `csoc-e2e` now takes its regulator side from the `vendor/waste-packaging-regulator-tests` submodule (pinned at
  `336571d`), and owns the regulator spec;
- the README, which documents the skills, the submodule and the credentials.

MO-548 (the analytics-event consumer in `waste-obligations-notifications`, PR #1 merged 29 Sep 2026, first in 0.1.0)
is assigned to Francis and IN QA. Its testing hasn't started: the environment hasn't been chosen and CDP log and
queue access hasn't been confirmed. The MY&DW release test cases and issues list are in `evidence/MYDW/RELEASE/`.
Their last full run was on 8 Oct 2026, and every failure was a known issue.

## Open follow-ups

1. MO-548: confirm whether PR #1 is the whole change and whether CDP dev/test logs and queues are reachable, then
   choose the environment (`/qa-ticket MO-548`).
2. Push `feat/claude-knowledge` and raise a PR once the user asks.
3. Move `mydw-e2e` and `csoc-e2e` onto `evidence-report`, one at a time.
4. Bump the `vendor/waste-packaging-regulator-tests` pin from `336571d` to the latest `main` (`ffd5765` on 8 Oct
   2026, with reverse-proxy URL and tab-locator changes), then rerun a csoc-e2e journey to confirm the regulator spec
   still passes.

## Recent evidence

- MY&DW release: `evidence/MYDW/RELEASE/` (local, shared via Confluence).
