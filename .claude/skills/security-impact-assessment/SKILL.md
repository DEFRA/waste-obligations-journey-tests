---
name: security-impact-assessment
description: Check every Jira ticket in a Fix Version (release) against the Security Impact Check in the programme's Definition of Done (CDP or Azure, read live from Confluence), and report per ticket and overall whether a formal Security Review is required before Done. Use when the user asks for a security impact assessment of a release or Fix Version, or whether a release needs security sign-off. Not for a single ticket.
user-invocable: true
allowed-tools: Bash, Read, Write, Agent
argument-hint: '<Fix Version>'
---

# Security impact assessment for a release

Adapted from `epr-qa-control-plane`'s `/release-security-impact-assessment`. It's read-only: the report stays local
unless the user asks for it to be posted.

## 1. The checklist

Read it live every run; it can change. Pick the Definition of Done that matches the release:

| Release                                                              | Page                                                  |
| -------------------------------------------------------------------- | ----------------------------------------------------- |
| CDP services (`waste-obligations*`, `packaging-waste-proxy`)         | **Definition of Done (CDP) - WIP**, page `6612943097` |
| Azure services (`epr-packaging-frontend`, PRN backend and functions) | **Definition of Done (Azure)**, page `6466995716`     |

```
node .claude/skills/confluence-read/confluence.mjs page 6612943097
```

- **Find the checklist:** use **Security Assessment > Lightweight Security Validation > Security Impact Check**, the
  list under "Confirm NO to all below otherwise include evidence of Security Team review in test exit report".
- **Record the version:** note the page version and its updated date in the report.
- **Mixed releases:** when a release has both kinds of service, use both pages.
- **Page unreadable:** if the script fails (exit 1 or 2), show the user the list below. Ask them to confirm it still
  matches the page, and use what they confirm. As read on 8 Oct 2026, both pages list:

1. Changes to authentication.
2. Changes to authorisation / access control.
3. New **public** API endpoints exposed.
4. Changes to encryption, secrets or key handling.
5. Changes in handling of sensitive data (PII, financial, health …): its validation, forwarding, storing or logging.
6. New external integrations (connecting out): APIs, database instances (not new tables or stored procedures), blob
   storage, topics or queues.

"If any item above is impacted Security Review required before Done."

## 2. The Fix Version and its tickets

Ask for the Fix Version if it wasn't given. Names are case-sensitive, for example
`Ducati V - Packaging Frontend v19.4`.

```
node .claude/skills/jira-read/jira.mjs search "fixVersion = \"<Fix Version>\" ORDER BY key" --json
```

No results doesn't mean the release is empty. List recent fix versions so the user can pick the exact name:

```
node .claude/skills/jira-read/jira.mjs search "project = MO AND fixVersion is not EMPTY ORDER BY updated DESC" --json
```

## 3. Assess every ticket in parallel

Launch one `Agent` (general-purpose) per ticket, **all in one message**, in the foreground. Each agent's prompt must
be self-contained:

- **The checklist:** paste the confirmed items themselves.
- **What to read:** tell it to run `node .claude/skills/jira-read/jira.mjs issue <KEY>` and
  `node .claude/skills/qa-ticket/pr-status.mjs <KEY>`, and to read the linked PRs' descriptions with
  `gh pr view <n> -R <repo>`.
- **The decision rule:** for each item, decide one of:

  - **No:** the ticket and PRs say enough to rule it out with confidence.
  - **Yes:** they show the item applies.
  - **Unclear:** there isn't enough to say No with confidence.

  The Definition of Done says "confirm NO to all", so **Unclear counts as Yes**. The verdict is "Security Review
  Required" if any item is Yes or Unclear, and "No security impact identified" only if every item is No.

- **The reply format:**

  ```
  KEY: <KEY>
  SUMMARY: <summary>
  VERDICT: Security Review Required | No security impact identified
  | Check item | Applies? | Evidence |
  | --- | --- | --- |
  | <item> | No/Yes/Unclear | <one line from the ticket or PR> |
  ```

## 4. Write the report

Write the report to `evidence/releases/<Fix Version>/security-impact-assessment.md`:

- the title, the date written in full, and the checklist source: page, version and updated date, or "confirmed by the user";
- the overall verdict, "SECURITY REVIEW REQUIRED" or "NO SECURITY REVIEW REQUIRED", with one line on how many of the
  N tickets trip the check;
- each ticket's block, exactly as its agent returned it.

Run `npx prettier --write` on the report.

## 5. Report back

Give the user:

- the overall verdict;
- the tickets that trip the check, and why;
- the path to the report.

Post nothing to Jira or Confluence unless the user asks separately, and then only through `jira-write` with its dry
run.
