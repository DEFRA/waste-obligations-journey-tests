# Lessons ledger

Lessons from QA sessions, recorded by `/handoff`. This file is the staging tier, below the always-loaded
"Known gotchas" in `.claude/rules/testing-lessons.md`. The process comes from `epr-qa-control-plane`.

Rules:

- **New lessons:** add one entry per lesson when a session surfaces it. The file is append-mostly.
- **Repeats:** a session that hits a lesson already listed adds the date to that entry's **Recurrences** line rather
  than writing a new entry.
- **Promotion:** at 2 or more recurrences, propose moving the entry into "Known gotchas" in
  `.claude/rules/testing-lessons.md`. Do it only after the user confirms, then delete the entry here.
- **Demotion:** propose deleting a known gotcha whose tooling or situation no longer exists.

---

## jira-scoped-token-myself

- **When:** a `jira-write` call that needs your own account (assign) fails on `GET /myself` with "scope does not
  match".
- **Do:** a scoped token needs `read:jira-user` for `/myself`. `jira-write` falls back to a `currentUser()` JQL
  search, which only needs `read:jira-work`. Writes also need `write:jira-work`. Confluence has its own token
  (`CONFLUENCE_API_TOKEN`), which works only through the gateway with the v2 API, so there is no CQL search.
- **Source:** assigning MO-548, 8 Oct 2026.
- **Recurrences:** —

## copied-skills-stay-identical

- **When:** running `npx prettier --write` across `.claude/` on `feat/claude-knowledge`.
- **Do:** format only the files you changed.
- **Superseded (9 Oct 2026):** this branch no longer keeps files byte-identical with `feat/manual-test-skills`; the
  user said not to work around that branch. Restructure on the merits.
- **Source:** adding `qa-ticket`, 8 Oct 2026.
- **Recurrences:** —

## cdp-not-reachable-from-laptop

- **When:** checking what a CDP service is running (`https://<service>.dev|test.cdp-int.defra.cloud/health`).
- **Do:** these hosts don't answer from a laptop (connection fails, HTTP 000). Read the deployed version from CDP
  Portal, or ask the user. `pr-status.mjs` gives the first version tag that contains the merge, to compare.
- **Source:** MO-548 environment check, 8 Oct 2026.
- **Recurrences:** —
