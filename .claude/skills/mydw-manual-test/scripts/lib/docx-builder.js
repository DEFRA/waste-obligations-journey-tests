'use strict'

const fs = require('fs')
const path = require('path')
const {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  PageBreak,
  AlignmentType,
  WidthType,
  ExternalHyperlink
} = require('docx')

function P(text, opts = {}) {
  return new Paragraph({ children: [new TextRun({ text, ...opts })] })
}
function H(text, level) {
  return new Paragraph({ text, heading: level })
}

function twoColRow(label, value) {
  return new TableRow({
    children: [
      new TableCell({
        children: [P(label, { bold: true })],
        width: { size: 30, type: WidthType.PERCENTAGE }
      }),
      new TableCell({
        children: [P(String(value ?? ''))],
        width: { size: 70, type: WidthType.PERCENTAGE }
      })
    ]
  })
}

function coverTable(meta) {
  const rows = [
    ['Ticket', meta.ticket],
    ['Test Case ID', meta.testCaseId],
    ['Journey', `${meta.journey} — ${meta.journeyTitle || ''}`],
    [
      'Organisation',
      `${meta.orgName} — ${meta.orgType} (${meta.orgTypeLabel})`
    ],
    ['Signed in as', `${meta.userName} — ${meta.roleLabel}`],
    [
      'Time-shift scenario',
      `${meta.scenario} — ${meta.scenarioLabel} (frontend clock: ${meta.frontendClock})`
    ],
    ['Compliance year (C)', meta.complianceYear],
    [
      'Feature flags',
      `ShowMultiYearObligations=${meta.flags.ShowMultiYearObligations}; ShowDecemberWaste=${meta.flags.ShowDecemberWaste}`
    ],
    [
      'Mode',
      meta.dryRun
        ? 'Dry run (no accept/reject committed)'
        : 'Live (accept/reject committed)'
    ],
    ['Language', meta.lang === 'cy' ? 'Welsh (cy)' : 'English (en)'],
    ['Environment', meta.env],
    ['Frontend base URL', meta.baseUrl],
    ['Browser', meta.browser || 'chromium (headed)'],
    ['Executed by', meta.executor || ''],
    ['Started at', meta.startedAt],
    ['Finished at', meta.finishedAt || ''],
    ['Frontend image', meta.frontendImage]
  ]
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([k, v]) => twoColRow(k, v))
  })
}

function headerCell(text) {
  return new TableCell({ children: [P(text, { bold: true })] })
}

function stepsTable(steps) {
  const header = new TableRow({
    children: ['#', 'Action', 'Expected', 'Actual', 'Result', 'Hypothesis'].map(
      headerCell
    ),
    tableHeader: true
  })
  const body = steps.map(
    (s, i) =>
      new TableRow({
        children: [
          new TableCell({ children: [P(String(i + 1))] }),
          new TableCell({ children: [P(s.action || s.title || '')] }),
          new TableCell({ children: [P(s.expected || '')] }),
          new TableCell({
            children: [
              P(s.verdict === 'PASS' && !s.note ? 'As expected' : s.note || ''),
              ...(s.observed
                ? [
                    P(`Automation observed: ${s.observed}`, {
                      italics: true,
                      size: 18
                    })
                  ]
                : [])
            ]
          }),
          new TableCell({
            children: [
              P(s.verdict || '', {
                bold: true,
                color:
                  s.verdict === 'FAIL'
                    ? 'C00000'
                    : s.verdict === 'PASS'
                      ? '007A33'
                      : '666666'
              })
            ]
          }),
          new TableCell({ children: [P(s.hypothesis || '')] })
        ]
      })
  )
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...body]
  })
}

function preconditionsBlock(preconditions) {
  if (!preconditions || !preconditions.length) {
    return [P('None recorded.')]
  }
  return preconditions.map(
    (entry) =>
      new Paragraph({
        text: `• ${entry}`
      })
  )
}

function signOffTable() {
  const cell = (t, bold = false) =>
    new TableCell({ children: [P(t, { bold })] })
  const blank = () => new TableCell({ children: [P('')] })
  const rows = [
    new TableRow({
      children: [
        cell('Role', true),
        cell('Name', true),
        cell('Signature', true),
        cell('Date', true)
      ]
    }),
    new TableRow({
      children: [cell('QA / Tester'), blank(), blank(), blank()]
    }),
    new TableRow({
      children: [cell('Product Owner'), blank(), blank(), blank()]
    }),
    new TableRow({
      children: [cell('Regulator (optional)'), blank(), blank(), blank()]
    })
  ]
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
}

// Scale a PNG to fit the page body without distorting it. Width and height come from the IHDR chunk.
const MAX_IMAGE_WIDTH = 600
const MAX_IMAGE_HEIGHT = 780
function fitToPage(png) {
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  const scale = Math.min(MAX_IMAGE_WIDTH / width, MAX_IMAGE_HEIGHT / height, 1)
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale)
  }
}

function screenshotSection(steps) {
  const children = []
  let fig = 0
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    if (!s.screenshotPath || !fs.existsSync(s.screenshotPath)) continue
    fig += 1
    const data = fs.readFileSync(s.screenshotPath)
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ data, transformation: fitToPage(data) })]
      })
    )
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `Fig ${fig} — ${s.title || s.action || ''} (${s.verdict})`,
            italics: true,
            size: 20
          })
        ]
      })
    )
    children.push(P(''))
  }
  if (!children.length) children.push(P('No screenshots captured.'))
  return children
}

function defectsBlock(steps) {
  const fails = steps.filter((s) => s.verdict === 'FAIL')
  if (!fails.length) return [P('No defects observed.')]
  return fails.map((s, i) =>
    P(
      `D${i + 1}. Step ${s.id} "${s.title || s.action}" — ${s.note || 'no reason given'}`
    )
  )
}

function buildCellDocument(meta, steps) {
  const children = [
    H('Multi-Year & December Waste — Manual Test Evidence', HeadingLevel.TITLE),
    P(''),
    H('1. Cover', HeadingLevel.HEADING_1),
    coverTable(meta),
    P(''),
    H('2. Preconditions', HeadingLevel.HEADING_1),
    ...preconditionsBlock(meta.preconditions || []),
    P(''),
    H('3. Steps', HeadingLevel.HEADING_1),
    stepsTable(steps),
    new Paragraph({ children: [new PageBreak()] }),
    H('4. Screenshots', HeadingLevel.HEADING_1),
    ...screenshotSection(steps),
    new Paragraph({ children: [new PageBreak()] }),
    H('5. Defects Observed', HeadingLevel.HEADING_1),
    ...defectsBlock(steps),
    P(''),
    H('6. Sign-off', HeadingLevel.HEADING_1),
    signOffTable()
  ]
  return new Document({ sections: [{ children }] })
}

function summaryDocument({ ticket, cells }) {
  const header = new TableRow({
    children: [
      'Cell',
      'Journey',
      'Org / role',
      'Scenario',
      'Lang',
      'Steps',
      'Pass',
      'Fail',
      'Skip',
      'Overall'
    ].map(headerCell),
    tableHeader: true
  })
  const rows = cells.map(
    (c) =>
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new ExternalHyperlink({
                    link: `./${c.relDocxPath}`,
                    children: [
                      new TextRun({
                        text: c.cellName,
                        style: 'Hyperlink',
                        color: '0563C1'
                      })
                    ]
                  })
                ]
              })
            ]
          }),
          new TableCell({ children: [P(c.journey)] }),
          new TableCell({ children: [P(`${c.orgType} / ${c.role}`)] }),
          new TableCell({ children: [P(c.scenario)] }),
          new TableCell({ children: [P(c.lang || 'en')] }),
          new TableCell({ children: [P(String(c.totals.total))] }),
          new TableCell({ children: [P(String(c.totals.pass))] }),
          new TableCell({ children: [P(String(c.totals.fail))] }),
          new TableCell({ children: [P(String(c.totals.skip))] }),
          new TableCell({
            children: [
              P(c.overall, {
                bold: true,
                color: c.overall === 'FAIL' ? 'C00000' : '007A33'
              })
            ]
          })
        ]
      })
  )
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...rows]
  })

  return new Document({
    sections: [
      {
        children: [
          H(`MY & DW Evidence Summary — ${ticket}`, HeadingLevel.TITLE),
          P(''),
          P(
            `Cells: ${cells.length}. Each cell's evidence pack is the .docx with the same name in this folder; click a cell name to open it.`
          ),
          P(''),
          table,
          P(''),
          H('Research hypothesis observations', HeadingLevel.HEADING_1),
          ...hypothesisSection(cells)
        ]
      }
    ]
  })
}

const HYPOTHESES = require('../config').HYPOTHESES

function hypothesisSection(cells) {
  const out = []
  for (const [h, text] of Object.entries(HYPOTHESES)) {
    const notes = cells.flatMap((c) =>
      (c.hypothesisNotes || [])
        .filter((n) => n.h === h)
        .map((n) => `${c.cellName} — ${n.step}: ${n.note}`)
    )
    out.push(P(`${h}: ${text}`, { bold: true }))
    if (!notes.length)
      out.push(P('No observations recorded.', { italics: true }))
    for (const n of notes) out.push(new Paragraph({ text: `• ${n}` }))
  }
  return out
}

async function saveDocument(doc, outPath) {
  const buf = await Packer.toBuffer(doc)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, buf)
  return outPath
}

module.exports = { buildCellDocument, summaryDocument, saveDocument }
