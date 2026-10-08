// Records one test run for an evidence report: metadata, steps with expected/actual/result, and the screenshots
// taken during each step. Everything lands in <runDir>: run.json plus screenshots/NNN_<side>_<slug>.png with a
// .txt caption beside each (the same layout as utils/screenshot-recorder.js, so the report builder can read
// screenshots from the other skills too).
//
//   import { createRun } from '../evidence-report/lib/run.mjs'
//   const run = await createRun(runDir, { title, ticket, environment, prs, tester })
//   run.step('1', 'Open the obligations page', 'The 2026 table is shown')
//   await run.shot(page, '2026 obligations page')
//   await run.text('GET /prns?status=AWAITING', transcript)   // API evidence: request/response text
//   run.pass('Shown with 3 materials')            // or run.fail('…'), run.note('…')
//   await run.finish()                            // writes run.json with the overall result
//
// build-report.mjs then turns <runDir> into <runDir>/<name>.docx.

import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ScreenshotRecorder } from '../../../../utils/screenshot-recorder.js'

export async function createRun(runDir, meta = {}, { side = 'run' } = {}) {
  await mkdir(runDir, { recursive: true })
  const recorder = await ScreenshotRecorder.create(
    path.join(runDir, 'screenshots'),
    { side }
  )
  const data = {
    title: meta.title || 'Test evidence',
    ticket: meta.ticket || null,
    environment: meta.environment || null,
    prs: meta.prs || [],
    tester: meta.tester || null,
    accounts: meta.accounts || [],
    preconditions: meta.preconditions || [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    result: null,
    steps: [],
    notes: []
  }
  let current = null
  const save = () =>
    writeFile(path.join(runDir, 'run.json'), JSON.stringify(data, null, 2))

  return {
    data,
    step(id, title, expected = '') {
      current = {
        id: String(id),
        title,
        expected,
        actual: '',
        result: null,
        screenshots: [],
        texts: []
      }
      data.steps.push(current)
      return current
    },
    async shot(page, caption) {
      const file = await recorder.capture(page, caption)
      const rel = path.relative(runDir, file)
      if (current) current.screenshots.push(rel)
      await save()
      return file
    },
    // A block of text evidence (an HTTP request and response, a log, a query result) for the current step.
    async text(caption, content) {
      const dir = path.join(runDir, 'transcripts')
      await mkdir(dir, { recursive: true })
      const n = String((await readdir(dir)).length + 1).padStart(3, '0')
      const slug = String(caption)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
      const rel = path.join('transcripts', `${n}_${slug}.txt`)
      await writeFile(
        path.join(runDir, rel),
        typeof content === 'string' ? content : JSON.stringify(content, null, 2)
      )
      if (current) current.texts.push({ caption, file: rel })
      await save()
      return rel
    },
    pass(actual = '') {
      if (current) Object.assign(current, { actual, result: 'PASS' })
    },
    fail(actual = '') {
      if (current) Object.assign(current, { actual, result: 'FAIL' })
    },
    blocked(actual = '') {
      if (current) Object.assign(current, { actual, result: 'BLOCKED' })
    },
    note(text) {
      data.notes.push(text)
    },
    async finish() {
      for (const s of data.steps) if (!s.result) s.result = 'NOT RUN'
      const results = data.steps.map((s) => s.result)
      data.result = results.includes('FAIL')
        ? 'FAIL'
        : results.includes('BLOCKED') || results.includes('NOT RUN')
          ? 'INCOMPLETE'
          : 'PASS'
      data.finishedAt = new Date().toISOString()
      await save()
      return data
    }
  }
}
