---
name: evidence-report
description: Shared test evidence for this repo's skills. Records a test run (ticket, environment, pull requests, steps with expected/actual/PASS/FAIL, full-page screenshots with captions) and builds one Word evidence report from it, then shows it to the user. Use from any skill or ad-hoc test that needs a sign-off document, or when the user asks to turn a run's screenshots into an evidence report.
user-invocable: true
allowed-tools: Bash, Read, Write
argument-hint: <runDir> [--name <file-stem>] [--open]
---

# Evidence report

One way to record a test run and turn it into a Word document, so every skill produces the same kind of evidence.

```
.claude/skills/evidence-report/
  lib/run.mjs         # createRun(): steps, results, screenshots and text evidence -> <runDir>/run.json, screenshots/, transcripts/
  build-report.mjs    # <runDir> -> <runDir>/<KEY>-<ENV>-<RESULT>.docx, and a text summary
```

## Record a run (in a Playwright script)

```js
import { createRun } from '<repo>/.claude/skills/evidence-report/lib/run.mjs'

const run = await createRun(runDir, {
  title: 'MO-449 Alternative content logic',
  ticket: {
    key: 'MO-449',
    summary: '…',
    url: 'https://eaflood.atlassian.net/browse/MO-449'
  },
  environment: {
    name: 'tst',
    url: 'https://rwd-tst1.azure.defra.cloud',
    build: 'epr-packaging-frontend PR #123 merged 6 Oct'
  },
  prs: [
    {
      repo: 'DEFRA/epr-packaging-frontend',
      number: 123,
      title: '…',
      state: 'MERGED'
    }
  ],
  tester: '<user name>',
  accounts: ['EA DRP approved person'],
  preconditions: ['2026 obligations calculated']
})
run.step('1', 'Choose 2026', 'Manage your 2026 recycling obligations is shown')
await run.shot(page, 'Manage your 2026 recycling obligations')
await run.text('GET /prns?status=AWAITING', transcript) // API evidence: request and response text
run.pass('Shown, with the 2026 table') // run.fail('…'), run.blocked('…'), run.note('…')
await run.finish() // overall result: PASS, FAIL or INCOMPLETE
```

- **What a screenshot is:** full page. It's saved as `screenshots/NNN_<side>_<slug>.png` with a `.txt` caption,
  the same layout as `utils/screenshot-recorder.js`. A screenshot is attached to the step that was open when it was
  taken.
- **API evidence:** `run.text(caption, content)` saves a request/response, log or query result as text
  (`transcripts/NNN_<slug>.txt`). The report shows it in a monospace block, cut at 150 lines. Remove tokens and keys
  first.
- **Steps:** one step per check in the approved test plan, using the plan's numbering and wording.
- **Actual:** what was seen, in a few words. Never just "as expected".

## Build and show it

```
node .claude/skills/evidence-report/build-report.mjs <runDir> --open
```

The command prints the document path and a per-step summary. Show the user that summary (overall result, every step
that isn't PASS and why), and open the document for them to review. Wait for their approval before the evidence goes
anywhere else (for example `jira-write`).

The document has:

- a cover: title, ticket, environment and build, tester, run time, accounts and the overall result;
- the pull requests and the preconditions;
- a summary table;
- notes;
- a page per step: expected, actual, result, its text evidence and its screenshots;
- any screenshots taken outside a step, at the end.

## Rules

- **Where it goes:** evidence goes under the gitignored `evidence/` folder, never the repository.
- **No secrets:** no passwords, tokens or `.env` values in `run.json`, captions or notes. Before sharing a screenshot,
  check it doesn't show credentials.
- **Results must be true:** don't mark a step PASS that wasn't checked. Use BLOCKED for a step that couldn't run, and
  say why.
- **Other skills:** `mydw-manual-test`, `mydw-e2e` and `csoc-e2e` still use their own builders. New skills use this
  one; move the others over one at a time, checking each one's output still matches.
