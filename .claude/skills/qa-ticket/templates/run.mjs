// Test run for one ticket, written by the qa-ticket skill from the approved plan.
// Copy to evidence/QA/<KEY>/<YYYYMMDD-HHmmss>/run.mjs, fill in META and one step() per planned test case, then run
// from the repo root:
//   node evidence/QA/<KEY>/<YYYYMMDD-HHmmss>/run.mjs
// Each result is saved the moment its test case finishes. A test case that throws is FAIL with its message and a
// screenshot, and the run carries on. For an API-only ticket, set `browser: false` and use run.text() for the
// requests and responses.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'
import { createRun } from '../../../../.claude/skills/evidence-report/lib/run.mjs'
import { openSession } from '../../../../.claude/skills/qa-ticket/lib/session.mjs'

const RUN_DIR = path.dirname(fileURLToPath(import.meta.url))

const META = {
  env: 'tst', // local | dev9 | tst
  account: 'matrix:EA:DRP', // see qa-ticket/lib/session.mjs
  browser: true,
  headed: true,
  title: 'MO-000 <ticket summary>',
  ticket: {
    key: 'MO-000',
    summary: '<summary>',
    url: 'https://eaflood.atlassian.net/browse/MO-000'
  },
  // Every AC from the ticket; descoped ones carry the reason the user agreed.
  acs: [
    { id: 'AC1', text: '<one line>' }
    // { id: 'AC5', text: '<one line>', descoped: '<reason>' }
  ],
  // The build the environment is actually running, and where that was read.
  build: {
    text: '<service version / image>',
    source: '<CDP Portal | docker ps | …>'
  },
  prs: [], // from pr-status.mjs --json: { repo, number, title, state }
  tester: '<git config user.name>',
  preconditions: []
}

const session = META.browser ? await openSession(META) : null
const page = session && session.page
const run = await createRun(RUN_DIR, {
  ...META,
  environment: {
    name: META.env,
    url: session ? session.urls.packaging : '<API base URL>'
  },
  accounts: session ? [session.account.label] : []
})
await run.build(META.build.text, META.build.source)

// Runs one planned test case; an exception fails it with its message (and a screenshot when there is a page).
async function step(id, title, expected, body) {
  run.step(id, title, expected)
  try {
    const actual = await body()
    await run.pass(actual)
  } catch (e) {
    if (page) await run.shot(page, `${id} failure`).catch(() => {})
    await run.fail(String(e.message).split('\n')[0])
  }
}

try {
  await step('AC1-TC1', 'Account home', 'Account home is shown', async () => {
    await expect(
      page.getByRole('heading', { name: /^Account home/ })
    ).toBeVisible()
    await run.shot(page, 'Account home')
    return 'Account home shown after sign-in'
  })

  // await step('AC1-TC2', '…', '…', async () => { … })
} finally {
  await run.finish()
  if (session) await session.close()
}
