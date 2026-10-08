---
name: jira-write
description: Add a comment to, attach files (evidence packs, PDFs, screenshots) to, assign to yourself, or set the Test Exit Summary field of, a Jira issue on eaflood.atlassian.net, using the JIRA_* credentials in this repo's .env. Every write is shown to the user as a dry run and sent only after they approve it. Use when the user asks to post test results, a retest note or a link to evidence on a ticket, to upload evidence files to it, to assign a ticket to themselves, or to record a Test Exit Summary. Comments, attachments, self-assignment and the Test Exit Summary field only; no issue creation, other edits or transitions.
user-invocable: true
allowed-tools: Bash, Read
argument-hint: comment <KEY> --file <path> | --text "<text>" | attach <KEY> <file> [file…] | assign <KEY> --me | exit-summary <KEY> --file <path>
---

# Jira write

The one place the skills in this repo write to Jira. Reading stays in `jira-read`.

Run from the repo root:

```
node .claude/skills/jira-write/jira-write.mjs comment MO-449 --file <scratchpad>/comment.md   # dry run
node .claude/skills/jira-write/jira-write.mjs comment MO-449 --text "Retested on tst: PASS"    # dry run
node .claude/skills/jira-write/jira-write.mjs attach MO-449 evidence/…/EA-DRP.docx            # dry run
node .claude/skills/jira-write/jira-write.mjs assign MO-449 --me                             # dry run: names who
node .claude/skills/jira-write/jira-write.mjs exit-summary MO-449 --file <run>/exit-summary.txt # dry run: current vs new
# …the same command with --yes sends it
```

## Workflow

1. **Check the issue.** Run `node .claude/skills/jira-read/jira.mjs issue <KEY>` and tell the user its summary and
   status, so the right ticket gets the write.
2. **Draft.** For a comment, write the text to a file in the scratchpad. Keep it short and factual: what was tested,
   where (env, scenario, accounts), the result, and the evidence file names. Supported formatting: paragraphs,
   `- ` bullets, `1. ` numbered items, `# ` headings, `**bold**` and `` `code` ``.
3. **Dry run.** Run the command without `--yes`. Show the user the printed comment or file list.
4. **Approve.** Ask the user to approve that exact write. A change to the text or files needs a new dry run and a new
   approval. An approval covers one write, not the rest of the session.
5. **Send.** Run the same command with `--yes`. Report the comment id or the attached file names.

## Rules

- **Only comments, attachments, assigning to yourself and the Test Exit Summary field** (`customfield_20837` in MO,
  found by name). Only when the user asks. Don't create or transition issues, change other fields, assign to anyone
  else, or delete anything.
- **Test Exit Summary:** it goes in the field, not in a comment. It's one sentence on how the ticket was tested; the
  result goes in the comment.
- **No secrets or personal data:** no tokens, passwords, `.env` values, database connection details or test account
  credentials in comments or files. Check each file before attaching it; evidence packs can contain screenshots of
  account details.
- **Attachments:** up to 10 MB each. Large evidence goes to Confluence or SharePoint, with a link in a comment.
- **Never** print, echo or log the token or email.
- **Credentials:** the same `JIRA_BASE_URL`, `JIRA_EMAIL` and `JIRA_API_TOKEN` as `jira-read`. The token needs write
  access: a classic API token, or a scoped token with `write:jira-work` and `read:jira-user` (assign looks up your
  account through `/myself`). A read-only scoped token fails with 401 or 403 ("scope does not match"): tell the user
  and stop. The current repo token is read-only (8 Oct 2026).

## Exit codes

| Code | Meaning                                           | What to do                                         |
| ---- | ------------------------------------------------- | -------------------------------------------------- |
| 0    | Sent, or the dry run printed                      | Report it                                          |
| 2    | `JIRA_*` variables missing                        | Say which are missing; give the user the text/file |
| 1    | Bad arguments, missing file or the request failed | Show the error line; don't retry a failed send     |
