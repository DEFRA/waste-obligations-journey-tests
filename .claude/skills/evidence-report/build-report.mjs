#!/usr/bin/env node
// Builds the evidence for one run folder written by lib/run.mjs (run.json, screenshots/, transcripts/):
//
//   <KEY>-<env>-<RESULT>.docx  the Word report for reviewers (per AC: test cases, expected/actual, screenshots)
//   test-cases.txt             the terse record: [ACn] verdict, then one line per test case
//   evidence.txt               the full log: build under test, then every test case with its raw evidence
//   exit-summary.txt           one sentence on how it was tested, for the ticket's Test Exit Summary
//
//   node .claude/skills/evidence-report/build-report.mjs <runDir> [--name <file-stem>] [--open]
//
// Prints the paths and a per-AC summary for the chat. --open opens the Word document (macOS `open`).

import { execFileSync } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx'

// Body text 12pt (docx sizes are half-points). Screenshots contain-fit a box well inside an A4 page.
const BODY = 24
const MAX_W = 480
const MAX_H = 560
const MAX_TEXT_LINES = 150
const COLOURS = {
  PASS: '2E7D32',
  FAIL: 'C62828',
  BLOCKED: 'B26A00',
  INCOMPLETE: 'B26A00',
  'NOT RUN': '6B6B6B',
  DESCOPED: '6B6B6B'
}
const RANK = ['FAIL', 'BLOCKED', 'NOT RUN', 'PASS']

const runDir = process.argv[2]
if (!runDir || runDir.startsWith('--')) {
  process.stderr.write(
    'usage: build-report.mjs <runDir> [--name <file-stem>] [--open]\n'
  )
  process.exit(1)
}
const nameAt = process.argv.indexOf('--name')

// ------------------------------------------------------------------ helpers

const text = (t, opts = {}) =>
  new TextRun({ text: String(t ?? ''), size: BODY, ...opts })
const para = (t, opts = {}) => new Paragraph({ children: [text(t)], ...opts })
const label = (name, value) =>
  new Paragraph({
    children: [text(`${name}: `, { bold: true }), text(value || '-')]
  })
const verdict = (name, value) =>
  new Paragraph({
    children: [
      text(`${name}: `, { bold: true }),
      text(value, { bold: true, color: COLOURS[value] })
    ]
  })
const heading = (t, level = HeadingLevel.HEADING_2) =>
  new Paragraph({ heading: level, children: [new TextRun(String(t))] })
// A bold rule between major sections (instead of a page break).
const rule = () =>
  new Paragraph({
    border: {
      bottom: { color: '0B0C0C', space: 4, style: BorderStyle.SINGLE, size: 18 }
    }
  })

function cell(value, { bold = false, fill, colour } = {}) {
  return new TableCell({
    shading: fill
      ? { type: ShadingType.CLEAR, color: 'auto', fill }
      : undefined,
    children: [
      new Paragraph({ children: [text(value, { bold, color: colour })] })
    ]
  })
}

function table(header, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: header.map((h) => cell(h, { bold: true, fill: 'EEEEEE' }))
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: r.map((v, i) => {
              const last = i === r.length - 1
              return cell(v, {
                bold: last && Boolean(COLOURS[v]),
                colour: last ? COLOURS[v] : undefined
              })
            })
          })
      )
    ]
  })
}

function fitted(buffer) {
  const ok = buffer.length > 24 && buffer.toString('ascii', 12, 16) === 'IHDR'
  if (!ok) return { width: MAX_W, height: MAX_H }
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  const scale = Math.min(1, MAX_W / width, MAX_H / height)
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale)
  }
}

async function caption(file) {
  try {
    return (await readFile(file.replace(/\.png$/, '.txt'), 'utf8')).trim()
  } catch {
    return path.basename(file, '.png').replace(/^\d+_[a-z]+_/, '')
  }
}

async function image(file) {
  const buffer = await readFile(file)
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new ImageRun({
          type: 'png',
          data: buffer,
          transformation: fitted(buffer)
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [text(await caption(file), { italics: true, size: 18 })]
    })
  ]
}

async function textBlock({ caption: title, file }) {
  const lines = (await readFile(path.join(runDir, file), 'utf8')).split('\n')
  const shown = lines.slice(0, MAX_TEXT_LINES)
  if (lines.length > MAX_TEXT_LINES)
    shown.push(`… ${lines.length - MAX_TEXT_LINES} more lines in ${file}`)
  return [
    new Paragraph({ children: [text(title, { bold: true })] }),
    ...shown.map(
      (l) =>
        new Paragraph({
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F5F5F5' },
          children: [new TextRun({ text: l, font: 'Courier New', size: 16 })]
        })
    )
  ]
}

// Absolute dates, UK time.
const when = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        timeZone: 'Europe/London',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : '-'

// Writes a file; a file open in Word shows up as EBUSY/EPERM, which needs the user to close it, not a retry.
async function write(file, data) {
  try {
    await writeFile(file, data)
  } catch (e) {
    if (['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) {
      throw new Error(
        `${file} is locked (probably open in Word). Close it and run this again.`
      )
    }
    throw e
  }
}

// ------------------------------------------------------------------ model

function groupByAc(run) {
  const acs = run.acs.map((a) => ({ ...a, steps: [] }))
  const byId = Object.fromEntries(acs.map((a) => [a.id, a]))
  const other = { id: null, text: 'Other checks', steps: [] }
  for (const s of run.steps) {
    if (s.ac && !byId[s.ac]) {
      byId[s.ac] = { id: s.ac, text: s.ac, steps: [] }
      acs.push(byId[s.ac])
    }
    ;(s.ac ? byId[s.ac] : other).steps.push(s)
  }
  for (const a of acs) {
    a.result = a.descoped
      ? 'DESCOPED'
      : a.steps.length
        ? RANK.find((r) => a.steps.some((s) => s.result === r)) || 'PASS'
        : 'NOT RUN'
  }
  acs.sort((x, y) => Number(x.id.slice(2)) - Number(y.id.slice(2)))
  return other.steps.length ? [...acs, other] : acs
}

function defaultExitSummary(run) {
  const ui = run.steps.some((s) => s.screenshots.length)
  const api = run.steps.some((s) => (s.texts || []).length)
  const how =
    ui && api
      ? 'via the UI and by calling the API directly'
      : api
        ? 'by calling the API directly'
        : 'via the UI'
  const env =
    (run.environment && run.environment.name) || 'the test environment'
  return `Each acceptance criterion was verified on ${env} ${how}, covering the expected behaviour and the edge cases listed in the attached test-cases.txt.`
}

// ------------------------------------------------------------------ outputs

async function docx(run, groups, file) {
  const env = run.environment || {}
  const ticket = run.ticket || {}
  const children = [
    heading(run.title, HeadingLevel.TITLE),
    ticket.key
      ? label('Ticket', `${ticket.key} ${ticket.summary || ''}`.trim())
      : null,
    label('Environment', [env.name, env.url].filter(Boolean).join(' · ')),
    label(
      'Build under test',
      run.build
        ? `${run.build.text}${run.build.source ? ` (from ${run.build.source})` : ''}`
        : 'not recorded'
    ),
    label('Tested by', run.tester),
    label('Run', `${when(run.startedAt)} to ${when(run.finishedAt)}`),
    run.accounts.length ? label('Accounts', run.accounts.join('; ')) : null,
    verdict('Overall result', run.result),
    label('Test exit summary', run.exitSummary)
  ].filter(Boolean)

  if (run.prs.length) {
    children.push(
      rule(),
      heading('Pull requests'),
      table(
        ['Repository', 'PR', 'State'],
        run.prs.map((p) => [
          p.repo,
          `#${p.number} ${p.title || ''}`.trim(),
          p.state || '-'
        ])
      )
    )
  }
  if (run.preconditions.length) {
    children.push(
      heading('Preconditions'),
      ...run.preconditions.map((p) => para(p, { bullet: { level: 0 } }))
    )
  }
  children.push(
    rule(),
    heading('Summary'),
    table(
      ['AC', 'Requirement', 'Result'],
      groups.map((g) => [g.id || '-', g.text, g.result || '-'])
    )
  )
  if (run.notes.length) {
    children.push(
      heading('Notes'),
      ...run.notes.map((n) => para(n, { bullet: { level: 0 } }))
    )
  }

  for (const g of groups) {
    children.push(
      rule(),
      heading(g.id ? `${g.id}: ${g.text}` : g.text),
      verdict('Result', g.result || '-')
    )
    if (g.descoped) children.push(label('Reason', g.descoped))
    for (const s of g.steps) {
      children.push(
        heading(`${s.id} ${s.title}`, HeadingLevel.HEADING_3),
        label('Expected', s.expected),
        label(
          s.manual ? 'Verified by manually inspecting' : 'Actual',
          s.actual
        ),
        verdict('Result', s.result),
        label('Checked', when(s.at))
      )
      if (s.manual && s.url) {
        children.push(
          new Paragraph({
            children: [
              text('Tested manually: ', { bold: true }),
              new ExternalHyperlink({
                link: s.url,
                children: [text(s.url, { style: 'Hyperlink' })]
              })
            ]
          })
        )
      }
      for (const t of s.texts || []) children.push(...(await textBlock(t)))
      for (const f of s.screenshots)
        children.push(...(await image(path.join(runDir, f))))
    }
  }

  // Screenshots taken outside any step (or by another skill's recorder) go at the end.
  const used = new Set(
    run.steps.flatMap((s) => s.screenshots.map((f) => path.basename(f)))
  )
  let loose = []
  try {
    loose = (await readdir(path.join(runDir, 'screenshots')))
      .filter((f) => f.endsWith('.png') && !used.has(f))
      .sort()
  } catch {}
  if (loose.length) {
    children.push(rule(), heading('Other screenshots'))
    for (const f of loose)
      children.push(...(await image(path.join(runDir, 'screenshots', f))))
  }

  const doc = new Document({
    creator: 'waste-obligations-journey-tests',
    title: run.title,
    styles: { default: { document: { run: { size: BODY } } } },
    sections: [{ children }]
  })
  await write(file, await Packer.toBuffer(doc))
  return loose.length
}

function testCasesTxt(run, groups) {
  const env = (run.environment && run.environment.name) || '-'
  const lines = [
    `${(run.ticket && run.ticket.key) || run.title} — Test Evidence Report`,
    `Environment: ${env}`,
    `Build under test: ${run.build ? run.build.text : 'not recorded'}`,
    '',
    `OVERALL: ${run.result}`,
    ''
  ]
  for (const g of groups) {
    lines.push(`[${g.id || 'Other'}] ${g.text} — ${g.result}`)
    if (g.descoped) lines.push(`  Reason: ${g.descoped}`)
    for (const s of g.steps) {
      const tc = s.ac ? s.id.slice(s.ac.length + 1) || s.id : s.id
      lines.push(
        `  ${tc} ${s.title}: ${s.actual || 'no observation recorded'} — ${s.result}`
      )
    }
    lines.push('')
  }
  return lines.join('\n')
}

async function evidenceTxt(run, groups) {
  const env = run.environment || {}
  const bar = '-'.repeat(70)
  const lines = [
    `${(run.ticket && run.ticket.key) || run.title} — Full evidence log (${env.name || '-'})`,
    `Host: ${env.url || '-'}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    '=== Build under test ===',
    bar,
    run.build
      ? `${run.build.text}${run.build.source ? `\nSource: ${run.build.source}` : ''}`
      : 'not recorded',
    ''
  ]
  for (const g of groups) {
    lines.push(`=== ${g.id ? `${g.id}: ` : ''}${g.text} ===`)
    if (g.descoped) lines.push(`DESCOPED: ${g.descoped}`, '')
    for (const s of g.steps) {
      lines.push(bar, `[${s.at || 'not run'}] ${s.id} ${s.title}`)
      lines.push(`Expected: ${s.expected || '-'}`)
      if (s.manual) {
        lines.push(
          'Tested manually:',
          'Verified by manually inspecting:',
          s.actual || '-'
        )
        if (s.url) lines.push(s.url)
      } else {
        lines.push(`Actual: ${s.actual || '-'}`)
      }
      lines.push(`Result: ${s.result}`)
      for (const t of s.texts || []) {
        lines.push(
          `$ ${t.caption}`,
          (await readFile(path.join(runDir, t.file), 'utf8')).trimEnd()
        )
      }
      if (s.screenshots.length)
        lines.push(`Screenshots: ${s.screenshots.join(', ')}`)
      lines.push('')
    }
  }
  return lines.join('\n')
}

// ------------------------------------------------------------------ main

async function main() {
  const run = JSON.parse(await readFile(path.join(runDir, 'run.json'), 'utf8'))
  run.acs = run.acs || []
  run.steps.forEach((s) => {
    s.ac = s.ac || (String(s.id).match(/^(AC\d+)\b/i) || [])[1] || null
  })
  if (!run.exitSummary) run.exitSummary = defaultExitSummary(run)
  const groups = groupByAc(run)
  const env = run.environment || {}
  const stem =
    nameAt !== -1
      ? process.argv[nameAt + 1]
      : [(run.ticket && run.ticket.key) || 'evidence', env.name, run.result]
          .filter(Boolean)
          .join('-')
          .replace(/[^\w.-]+/g, '_')
  const docxPath = path.join(runDir, `${stem}.docx`)

  const loose = await docx(run, groups, docxPath)
  await write(path.join(runDir, 'test-cases.txt'), testCasesTxt(run, groups))
  await write(path.join(runDir, 'evidence.txt'), await evidenceTxt(run, groups))
  await write(path.join(runDir, 'exit-summary.txt'), `${run.exitSummary}\n`)

  const shots = run.steps.reduce((n, s) => n + s.screenshots.length, 0) + loose
  const lines = [
    docxPath,
    `${path.join(runDir, 'test-cases.txt')} · evidence.txt · exit-summary.txt`,
    `${run.title} | ${env.name || '-'} | ${run.result} | build: ${run.build ? run.build.text : 'NOT RECORDED'}`,
    ...groups.flatMap((g) => [
      `  ${(g.id || 'Other').padEnd(5)} ${g.result.padEnd(8)} ${g.text}${g.descoped ? ` (${g.descoped})` : ''}`,
      ...g.steps
        .filter((s) => s.result !== 'PASS')
        .map((s) => `        ${s.id} ${s.result}: ${s.actual || 'no detail'}`)
    ]),
    `  screenshots: ${shots}`
  ]
  process.stdout.write(`${lines.join('\n')}\n`)
  if (process.argv.includes('--open')) execFileSync('open', [docxPath])
}

main().catch((e) => {
  process.stderr.write(`build-report: ${e.message}\n`)
  process.exit(1)
})
