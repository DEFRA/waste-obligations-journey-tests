---
name: handoff
description: Wrap up a QA session - record any reusable lesson in the lessons ledger (promoting repeat lessons to the always-loaded known gotchas, with the user's OK), rewrite the team handoff doc in place to reflect the current state and follow-ups, then check the session's artefacts against the quality bar. Use when the user says they're stopping, wrapping up, handing over, or asks for a handoff.
user-invocable: true
allowed-tools: Bash, Read, Edit, Write
---

# Handoff

Keeps what this team knows between sessions. Adapted from `epr-qa-control-plane`'s `/handoff`.

| File                                               | What it is                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `docs/handoff.md`                                  | Living state: what's in progress and what's next. Rewritten each time, never appended |
| `docs/lessons.md`                                  | The lessons ledger, the staging tier                                                  |
| `.claude/rules/testing-lessons.md` "Known gotchas" | The always-loaded tier, where repeat lessons get promoted                             |

Order: **lessons first, then the handoff doc, then the quality check.**

## 1. Lessons

Ask yourself whether this session surfaced a reusable lesson: a gotcha, a correction to how we work, or a mistake
that would catch the next person.

- **Already in `docs/lessons.md`:** add the date (for example "9 Oct 2026") to its **Recurrences** line. At 2 or
  more recurrences, propose promoting it to "Known gotchas" in `.claude/rules/testing-lessons.md`. Move it there only
  after the user says yes, and delete it from the ledger.
- **New:** add an entry in the ledger's format: When / Do / Source / Recurrences.
- **Stale gotcha:** if a known gotcha no longer applies (its tool or situation is gone), propose deleting it.
- **Not the handoff:** lessons never go into `docs/handoff.md`.

## 2. The handoff doc

Update `docs/handoff.md`, touching only what changed this session:

- **"Last touched":** always today's date, written in full.
- **"Current state":** one dense, present-tense paragraph. Delete the story of finished work; git history and the
  tickets' attachments keep it.
- **"Open follow-ups":** numbered and most actionable first, at most about 8. Add new ones and remove resolved ones;
  check against the tickets, the repo and this session before deleting. Ask about any that haven't moved for several
  sessions.
- **"Recent evidence":** link the tickets tested (`https://eaflood.atlassian.net/browse/<KEY>`, where the evidence is
  attached) and any local evidence folders.

Rewrite in place: no dated blocks, no new files.

## 3. Quality check

Check this session's artefacts against `.claude/skills/evidence-report/reference/quality-bar.md`: evidence, the
handoff edit, and any docs, rules or skills changes. List every miss to the user. Don't fix them silently, and don't
pass them silently.

## Rules

- **Format:** run `npx prettier --write` on the files you changed. Don't commit unless the user asks.
- **Dates and secrets:** dates in full, never relative. No secrets.
