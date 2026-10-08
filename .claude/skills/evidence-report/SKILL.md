---
name: evidence-report
description: Shared test evidence for this repo's skills. Records a test run as it happens (build under test, acceptance criteria and their test cases with expected/actual/PASS/FAIL/BLOCKED/DESCOPED, full-page or element screenshots, API text evidence, manual checks) and builds the Word report plus test-cases.txt, evidence.txt and exit-summary.txt, checked against a quality bar. Use from any skill or ad-hoc test that needs sign-off evidence, or when the user asks to turn a run into an evidence report.
user-invocable: true
allowed-tools: Bash, Read, Write
argument-hint: <runDir> [--name <file-stem>] [--open]
---

# Evidence report

One way to record a test run and turn it into evidence, so every skill produces the same thing. It follows the
"evidence over claims" practice from `epr-qa-control-plane`: a result counts only when it's logged, against a
known build, as it happens.

```
.claude/skills/evidence-report/
  lib/run.mjs               # createRun(): records the run into <runDir> as it happens
  build-report.mjs          # <runDir> -> .docx + test-cases.txt + evidence.txt + exit-summary.txt
  reference/quality-bar.md  # the checklist the evidence must pass before it's shared
```

## Record a run

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
    name: 'test',
    url: 'https://waste-obligations.test.cdp-int.defra.cloud'
  },
  prs: [
    {
      repo: 'DEFRA/waste-obligations-frontend',
      number: 123,
      title: '…',
      state: 'MERGED'
    }
  ],
  tester: '<git user.name>',
  accounts: ['EA DRP approved person'],
  acs: [
    {
      id: 'AC1',
      text: 'Current year with no H2 POM shows the alternative content'
    }
  ]
})
await run.build(
  'waste-obligations-frontend 0.212.0',
  'CDP Portal, test environment, 9 Oct 2026'
)
await run.descope(
  'AC4',
  'Welsh',
  'MO-575 not delivered; agreed with the tester'
)
run.step(
  'AC1-TC1',
  'Choose 2026',
  '"Manage your 2026 recycling obligations" is shown'
)
await run.shot(page, 'Manage your 2026 recycling obligations')
await run.shot(page, 'Totals row', { locator: page.locator('table') }) // just the part that matters
await run.text('GET /prns?status=AWAITING', transcript) // API evidence, tokens removed
await run.pass('Shown, with the 2026 table') // run.fail('…') / run.blocked('…')
await run.pass('Banner reads …', { manual: true, url: 'https://…' }) // checked by the tester
await run.finish()
```

- **Build first:** record the build under test before the first test case, read from the environment.
  - **CDP:** `node .claude/skills/cdp-portal/cdp.mjs build <service> --env <env>` prints the build and its source.
  - **LOCAL:** `docker ps --format '{{.Names}} {{.Image}}'`.
  - **Mismatch:** if it isn't the build the ticket names, stop and tell the user.
- **Test cases:** ids are `AC<n>-TC<m>`, so results group by AC. Each AC's result is its worst test case. A
  DESCOPED AC needs a reason the user agreed.
- **Saved as you go:** every result, screenshot and text block is written to `run.json` at once. Never fill results
  in afterwards.
- **Manual checks:** `{ manual: true, url }` labels the step "Tested manually" / "Verified by manually inspecting"
  and keeps the page link.

## Build, check and show

```
node .claude/skills/evidence-report/build-report.mjs <runDir> --open
```

It writes four files to `<runDir>`:

| File                        | Who it's for                   | What it holds                                                                                                                                      |
| --------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<KEY>-<env>-<RESULT>.docx` | Reviewers                      | Cover (build under test, result, exit summary), PRs, summary by AC, then each AC's test cases with expected, actual, text evidence and screenshots |
| `test-cases.txt`            | Quick review                   | `[ACn] verdict` and one line per test case                                                                                                         |
| `evidence.txt`              | Audit trail                    | Build under test, then every test case with timestamp, expected, actual and the raw text evidence                                                  |
| `exit-summary.txt`          | The ticket's Test Exit Summary | One sentence on how it was tested, never the result                                                                                                |

The Word report has 12pt body text, screenshots that fit within one page, and bold rules between sections.

Before you show it:

1. Check the run folder against `reference/quality-bar.md`, and tell the user about every miss.
2. Show the per-AC summary the command prints.
3. Open the document for them.

Wait for their approval before the evidence goes anywhere else (for example `jira-write`). If writing fails because a
file is locked, it's open in Word: ask the user to close it rather than retrying.

## Rules

- **Where it goes:** evidence lives under the gitignored `evidence/` folder, never in the repository.
- **No secrets:** no passwords, tokens or `.env` values in anything recorded. Check screenshots and transcripts before
  sharing.
- **Other skills:** `mydw-manual-test`, `mydw-e2e` and `csoc-e2e` still use their own builders. New skills use this
  one; move the others over one at a time, checking each one's output still matches.
