#!/usr/bin/env node
// Builds the Word evidence report for one run folder written by lib/run.mjs (run.json + screenshots/).
//
//   node .claude/skills/evidence-report/build-report.mjs <runDir> [--name <file-stem>] [--open]
//
// Writes <runDir>/<name>.docx (default name: <ticket key or "evidence">-<environment>-<result>) and prints a short
// text summary for the chat. --open opens the document (macOS `open`).

import { execFileSync } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx'

const PAGE_WIDTH_PX = 620
const MAX_HEIGHT_PX = 800
const COLOURS = {
  PASS: '2E7D32',
  FAIL: 'C62828',
  INCOMPLETE: 'B26A00',
  BLOCKED: 'B26A00'
}

const runDir = process.argv[2]
if (!runDir || runDir.startsWith('--')) {
  process.stderr.write(
    'usage: build-report.mjs <runDir> [--name <file-stem>] [--open]\n'
  )
  process.exit(1)
}
const nameAt = process.argv.indexOf('--name')

function fitted(buffer) {
  const ok = buffer.length > 24 && buffer.toString('ascii', 12, 16) === 'IHDR'
  if (!ok) return { width: PAGE_WIDTH_PX, height: MAX_HEIGHT_PX }
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  const scale = Math.min(1, PAGE_WIDTH_PX / width, MAX_HEIGHT_PX / height)
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale)
  }
}

const text = (t, opts = {}) => new TextRun({ text: String(t ?? ''), ...opts })
const para = (t, opts = {}) => new Paragraph({ children: [text(t)], ...opts })
const label = (name, value) =>
  new Paragraph({
    children: [text(`${name}: `, { bold: true }), text(value || '-')]
  })

function cell(value, { bold = false, fill, colour } = {}) {
  return new TableCell({
    shading: fill
      ? { type: ShadingType.CLEAR, color: 'auto', fill }
      : undefined,
    children: [
      new Paragraph({
        children: [text(value, { bold, color: colour })]
      })
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
            children: r.map((v, i) =>
              cell(v, {
                bold: i === r.length - 1 && COLOURS[v],
                colour: i === r.length - 1 ? COLOURS[v] : undefined
              })
            )
          })
      )
    ]
  })
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

// Text evidence in a monospace block, cut at MAX_TEXT_LINES so a large response doesn't swamp the report.
const MAX_TEXT_LINES = 150
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
          children: [text(l, { font: 'Courier New', size: 16 })]
        })
    )
  ]
}

const when = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        timeZone: 'Europe/London',
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    : '-'

async function main() {
  const run = JSON.parse(await readFile(path.join(runDir, 'run.json'), 'utf8'))
  const env = run.environment || {}
  const ticket = run.ticket || {}
  const result = run.result || 'INCOMPLETE'
  const children = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [text(run.title)] }),
    ticket.key
      ? label('Ticket', `${ticket.key} ${ticket.summary || ''}`.trim())
      : null,
    label('Environment', [env.name, env.url].filter(Boolean).join(' · ')),
    env.build ? label('Build / version', env.build) : null,
    label('Tested by', run.tester),
    label('Run', `${when(run.startedAt)} to ${when(run.finishedAt)}`),
    run.accounts.length ? label('Accounts', run.accounts.join('; ')) : null,
    new Paragraph({
      children: [
        text('Result: ', { bold: true }),
        text(result, { bold: true, color: COLOURS[result] })
      ]
    })
  ].filter(Boolean)

  if (run.prs.length) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [text('Pull requests')]
      }),
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
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [text('Preconditions')]
      }),
      ...run.preconditions.map((p) => para(p, { bullet: { level: 0 } }))
    )
  }
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [text('Summary')]
    }),
    table(
      ['Step', 'Check', 'Result'],
      run.steps.map((s) => [s.id, s.title, s.result])
    )
  )
  if (run.notes.length) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [text('Notes')]
      }),
      ...run.notes.map((n) => para(n, { bullet: { level: 0 } }))
    )
  }

  for (const s of run.steps) {
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [text(`Step ${s.id}: ${s.title}`)]
      }),
      label('Expected', s.expected),
      label('Actual', s.actual),
      new Paragraph({
        children: [
          text('Result: ', { bold: true }),
          text(s.result, { bold: true, color: COLOURS[s.result] })
        ]
      })
    )
    for (const t of s.texts || []) children.push(...(await textBlock(t)))
    for (const f of s.screenshots)
      children.push(...(await image(path.join(runDir, f))))
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
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [text('Other screenshots')]
      })
    )
    for (const f of loose)
      children.push(...(await image(path.join(runDir, 'screenshots', f))))
  }

  const stem =
    nameAt !== -1
      ? process.argv[nameAt + 1]
      : [ticket.key || 'evidence', env.name, result]
          .filter(Boolean)
          .join('-')
          .replace(/[^\w.-]+/g, '_')
  const out = path.join(runDir, `${stem}.docx`)
  const doc = new Document({
    creator: 'waste-obligations-journey-tests',
    title: run.title,
    sections: [{ children }]
  })
  await writeFile(out, await Packer.toBuffer(doc))

  const lines = [
    `${out}`,
    `${run.title} | ${env.name || '-'} | ${result}`,
    ...run.steps.map(
      (s) =>
        `  ${s.id}. ${s.result.padEnd(7)} ${s.title}${s.result === 'PASS' ? '' : ` (${s.actual || 'no detail'})`}`
    ),
    `  screenshots: ${run.steps.reduce((n, s) => n + s.screenshots.length, 0) + loose.length}`
  ]
  process.stdout.write(`${lines.join('\n')}\n`)
  if (process.argv.includes('--open')) execFileSync('open', [out])
}

main().catch((e) => {
  process.stderr.write(`build-report: ${e.message}\n`)
  process.exit(1)
})
