// Records one test run for an evidence report: metadata, the build under test, the acceptance criteria and their
// test cases (expected / actual / result), and the screenshots and text evidence behind each one. Everything is
// written to <runDir> as it happens (never batched): run.json, screenshots/NNN_<side>_<slug>.png with a .txt
// caption (the utils/screenshot-recorder.js layout), and transcripts/NNN_<slug>.txt.
//
//   import { createRun } from '../evidence-report/lib/run.mjs'
//   const run = await createRun(runDir, { title, ticket, environment, prs, tester, accounts, acs })
//   await run.build('waste-obligations 0.157.0 (CDP Portal, test)', 'https://portal.cdp-int.defra.cloud/…')
//   run.descope('AC5', 'Dead-letter queue', 'Needs CDP queue access; agreed with the tester')
//   run.step('AC1-TC1', 'Choose 2026', '"Manage your 2026 recycling obligations" is shown')
//   await run.shot(page, '2026 obligations page')               // full page
//   await run.shot(page, 'Totals row', { locator: page.locator('table') })   // just that element
//   await run.text('GET /prns?status=AWAITING', transcript)     // API evidence (remove tokens first)
//   run.pass('Shown with the 2026 table')                       // run.fail / run.blocked
//   run.pass('Banner reads …', { manual: true, url: 'https://…' })   // checked by the tester, with the page link
//   await run.finish()
//
// build-report.mjs then turns <runDir> into the Word report plus test-cases.txt, evidence.txt and exit-summary.txt.

import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ScreenshotRecorder } from '../../../../utils/screenshot-recorder.js'

const slugify = (s, n = 60) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, n)

// "AC2-TC1" -> "AC2"; anything else has no AC.
const acOf = (id) => (String(id).match(/^(AC\d+)\b/i) || [])[1] || null

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
    build: meta.build || null,
    prs: meta.prs || [],
    tester: meta.tester || null,
    accounts: meta.accounts || [],
    preconditions: meta.preconditions || [],
    // [{ id: 'AC1', text: '…' }]; descoped ones get { descoped: '<reason>' }.
    acs: (meta.acs || []).map((a) => ({ ...a })),
    exitSummary: meta.exitSummary || null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    result: 'IN PROGRESS',
    steps: [],
    notes: []
  }
  let current = null
  const save = () =>
    writeFile(path.join(runDir, 'run.json'), JSON.stringify(data, null, 2))

  const result =
    (status) =>
    async (actual = '', opts = {}) => {
      if (!current) return
      Object.assign(current, {
        actual,
        result: status,
        at: new Date().toISOString(),
        manual: Boolean(opts.manual),
        url: opts.url || null
      })
      await save()
    }

  await save()
  return {
    data,
    // The build the environment is actually running, read from the environment (not the ticket's claim).
    async build(text, source = null) {
      data.build = { text, source, at: new Date().toISOString() }
      await save()
    },
    async descope(acId, text, reason) {
      const ac = data.acs.find((a) => a.id === acId)
      if (ac) ac.descoped = reason
      else data.acs.push({ id: acId, text, descoped: reason })
      await save()
    },
    step(id, title, expected = '') {
      current = {
        id: String(id),
        ac: acOf(id),
        title,
        expected,
        actual: '',
        result: null,
        at: null,
        manual: false,
        url: null,
        screenshots: [],
        texts: []
      }
      data.steps.push(current)
      return current
    },
    async shot(page, caption, { locator } = {}) {
      let file
      if (locator) {
        recorder.counter += 1
        const n = String(recorder.counter).padStart(3, '0')
        file = path.join(
          recorder.dir,
          `${n}_${side}_${slugify(caption, 80)}.png`
        )
        await locator.screenshot({ path: file })
        await writeFile(file.replace(/\.png$/, '.txt'), `${caption}\n`, 'utf8')
      } else {
        file = await recorder.capture(page, caption)
      }
      if (current) current.screenshots.push(path.relative(runDir, file))
      await save()
      return file
    },
    async text(caption, content) {
      const dir = path.join(runDir, 'transcripts')
      await mkdir(dir, { recursive: true })
      const n = String((await readdir(dir)).length + 1).padStart(3, '0')
      const rel = path.join('transcripts', `${n}_${slugify(caption)}.txt`)
      await writeFile(
        path.join(runDir, rel),
        typeof content === 'string' ? content : JSON.stringify(content, null, 2)
      )
      if (current) current.texts.push({ caption, file: rel })
      await save()
      return rel
    },
    pass: result('PASS'),
    fail: result('FAIL'),
    blocked: result('BLOCKED'),
    async note(text) {
      data.notes.push(text)
      await save()
    },
    async exitSummary(text) {
      data.exitSummary = text
      await save()
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
