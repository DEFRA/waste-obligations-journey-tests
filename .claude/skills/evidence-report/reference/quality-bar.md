# Quality bar for evidence

Adapted from `epr-qa-control-plane` `docs/quality-bar.md`. Check the run folder against every line before the
evidence is shown for approval, and again before it goes to Jira.

- **Answers:** answer each line yes or no. No scores.
- **Misses:** tell the user about each one. Never fix one silently, and never pass one silently.

## Evidence (`evidence/<area>/<KEY>/<ts>/`)

- **Build under test recorded:** the version the environment was actually running, read from the environment, not
  the version the ticket claims. Where it came from is recorded too (`run.build(text, source)`).
- **Scope agreed:** every AC from the ticket appears. Out-of-scope ones are DESCOPED with a reason the user agreed.
- **One result per in-scope AC:** PASS, FAIL or BLOCKED, built from its test cases (`[ACn] TCm`). Each result was
  logged when the test case finished, not filled in afterwards.
- **Actuals are observations:** what was seen, never "as expected". No PASS for something that wasn't checked.
- **Manual checks labelled:** "Tested manually" / "Verified by manually inspecting", with a direct link to the page
  that was checked.
- **Facts only:** no editorial framing ("worth noting", "the stronger case"). No failed access attempts, permission
  errors or tooling workarounds; only the check that proved the condition.
- **Absolute dates:** never "today", "yesterday" or "this session".
- **No secrets:** no passwords, tokens, API keys, connection strings or `.env` values in `run.json`, transcripts,
  captions or screenshots. No hash or checksum values: describe what the check proved instead.
- **Screenshots readable:** each fits on one page; when only part of a page matters, use an element screenshot
  (`run.shot(page, caption, { locator })`).
- **All four files present:** the `.docx`, `test-cases.txt`, `evidence.txt` and `exit-summary.txt`.
- **Exit summary:** one sentence on how it was tested (UI, API or both; expected behaviour and edge cases). It says
  nothing about the result.
- **In the right place:** everything in the run folder under the gitignored `evidence/`, nothing loose.

## Handoff and lessons (`docs/handoff.md`, `docs/lessons.md`)

- **Handoff is present tense:** current state only, rewritten in place, with no dated appends and no narrative of
  finished work.
- **Follow-ups:** numbered, actionable and in priority order, at most about 8, and none already resolved.
- **Lessons go in the ledger:** reusable lessons go in `docs/lessons.md`, not the handoff.

## Docs, rules and skills edits

- **No duplication:** content that lives elsewhere is linked, not copied.
- **Short always-loaded files:** `CLAUDE.md` and `.claude/rules/` load on every session, so keep them distilled.
