---
name: brief
description: The daily QA homepage for this repo - your Jira tickets (assigned to you and in progress or IN QA), the MO tickets waiting in IN QA, any open qa-ticket evidence session, the handoff's follow-ups, the branch state and whether the local stack is up - then ask what to drive. Use at the start of a session or when the user asks what's on, what's next, or for a status brief.
user-invocable: true
allowed-tools: Bash, Read
---

# Daily brief

Run these checks (all read-only), show a short, scannable summary, then ask what to drive. Adapted from
`epr-qa-control-plane`'s `/brief`.

## 1. My tickets

```
node .claude/skills/jira-read/jira.mjs search "assignee = currentUser() AND statusCategory != Done ORDER BY status, updated DESC"
```

If the command exits 2 (no `JIRA_*` in `.env`), say so plainly rather than failing silently.

## 2. Waiting for QA

```
node .claude/skills/jira-read/jira.mjs search "project = MO AND status = 'IN QA' ORDER BY updated DESC"
```

Show the count, and the unassigned ones.

## 3. Open evidence session

```
[ -f evidence/QA/.active ] && cat evidence/QA/.active
```

If a session is open, name the ticket and offer to resume it with `/qa-ticket <KEY>`.

## 4. Handoff

Read the "Open follow-ups" in `docs/handoff.md` and list the top three.

## 5. Repo and stack

```
git status -sb | head -1
git log --oneline -1
docker ps --format '{{.Names}}' 2>/dev/null | grep -c epr-local-environment
```

Report:

- the branch, and whether it's ahead or behind its remote;
- the number of uncommitted files;
- whether the local stack is running. If it is, add its frozen clock from `grep TIMESHIFT_DATETIME` in the sibling
  `epr-local-environment/.env`; read only that key, never the rest of the file.

## 6. Wrap up

Summarise in a few lines, then ask: _"What would you like to drive: a ticket in QA, a release test plan, the
automated suites, or something else?"_
