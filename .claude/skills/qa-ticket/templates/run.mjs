// Test run for one ticket, written by the qa-ticket skill from the approved plan.
// Copy to evidence/QA/<KEY>/<YYYYMMDD-HHmmss>/run.mjs, fill in META and the steps, then run from the repo root:
//   node evidence/QA/<KEY>/<YYYYMMDD-HHmmss>/run.mjs
// Each step follows the plan: one run.step(), the actions, a screenshot (or run.text for API evidence) and
// run.pass/fail/blocked with what was actually seen. A step that throws is marked FAIL and the run carries on.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'
import { createRun } from '../../../../.claude/skills/evidence-report/lib/run.mjs'
import { openSession } from '../../../../.claude/skills/qa-ticket/lib/session.mjs'

const RUN_DIR = path.dirname(fileURLToPath(import.meta.url))

const META = {
  env: 'tst', // local | dev9 | tst
  account: 'matrix:EA:DRP', // see qa-ticket/lib/session.mjs
  title: 'MO-000 <ticket summary>',
  ticket: {
    key: 'MO-000',
    summary: '<summary>',
    url: 'https://eaflood.atlassian.net/browse/MO-000'
  },
  build: '<repo PR #N, first in version X / deployed version>',
  prs: [], // from pr-status.mjs --json: { repo, number, title, state }
  tester: '<name>',
  preconditions: []
}

const { page, urls, account, close } = await openSession(META)
const run = await createRun(RUN_DIR, {
  ...META,
  environment: { name: META.env, url: urls.packaging, build: META.build },
  accounts: [account.label]
})

// Runs one planned step; an exception fails the step with its message and screenshot.
async function step(id, title, expected, body) {
  run.step(id, title, expected)
  try {
    const actual = await body()
    run.pass(actual)
  } catch (e) {
    await run.shot(page, `Step ${id} failure`).catch(() => {})
    run.fail(String(e.message).split('\n')[0])
  }
}

try {
  await step('1', 'Account home', 'Account home is shown', async () => {
    await expect(
      page.getByRole('heading', { name: /^Account home/ })
    ).toBeVisible()
    await run.shot(page, 'Account home')
    return 'Account home shown after sign-in'
  })

  // await step('2', '…', '…', async () => { … })
} finally {
  await run.finish()
  await close()
}
