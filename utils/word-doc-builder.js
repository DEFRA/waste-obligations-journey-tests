import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  PageBreak,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx'

// A4 minus 1-inch (72pt) margins → 6.5in width. docx expects pixels; screenshots
// come out at browser resolution (1280w default). We scale each image to fit
// within these bounds while preserving its native aspect ratio, so full-page
// tall screenshots don't get squashed and wide ones don't get stretched.
const PAGE_WIDTH_PX = 620
const MAX_HEIGHT_PX = 800

// Reads the intrinsic width/height from a PNG buffer's IHDR chunk. The
// PNG signature is 8 bytes; the first chunk is always IHDR (4 length +
// 4 "IHDR" + 4 width + 4 height, all big-endian). Cheaper than adding a
// dependency (image-size, sharp, etc.) for a value we only need once.
function readPngDimensions(buffer) {
  if (buffer.length < 24) return null
  // Bytes 12..15 spell "IHDR" for a well-formed PNG.
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  }
}

// Given a source image size, returns the { width, height } that fits
// inside (PAGE_WIDTH_PX, MAX_HEIGHT_PX) with the same aspect ratio.
// Falls back to the box size if dimensions can't be read.
function fittedDimensions(buffer) {
  const dims = readPngDimensions(buffer)
  if (!dims || !dims.width || !dims.height) {
    return { width: PAGE_WIDTH_PX, height: MAX_HEIGHT_PX }
  }
  const ratio = Math.min(
    PAGE_WIDTH_PX / dims.width,
    MAX_HEIGHT_PX / dims.height
  )
  // Never upscale — if the source is smaller than the box, keep it as-is.
  const scale = ratio < 1 ? ratio : 1
  return {
    width: Math.round(dims.width * scale),
    height: Math.round(dims.height * scale)
  }
}

async function readCaption(pngPath) {
  try {
    const text = await readFile(pngPath.replace(/\.png$/, '.txt'), 'utf8')
    return text.trim()
  } catch {
    return path.basename(pngPath, '.png')
  }
}

// Colours for the per-test status cells. Green for pass, red for fail,
// amber for skipped/timed-out, grey for unknown. Kept as hex without the
// leading # (docx expects that).
const STATUS_COLOR = {
  passed: 'C8E6C9',
  failed: 'FFCDD2',
  timedOut: 'FFCDD2',
  interrupted: 'FFE0B2',
  skipped: 'ECEFF1'
}

const STATUS_LABEL = {
  passed: 'PASS',
  failed: 'FAIL',
  timedOut: 'TIMEOUT',
  interrupted: 'DID NOT RUN',
  skipped: 'SKIPPED'
}

// Strips characters that corrupt OOXML: ANSI escape codes (Playwright's
// error strings include them for terminal colouring), C0 control chars
// except tab/newline, and stray surrogate pairs. Also guards against empty
// strings — Word rejects TextRuns whose text is `''`.
function sanitizeText(input, { fallback = ' ', maxLength = 400 } = {}) {
  if (input === null || input === undefined) return fallback
  let s = String(input)
  // Drop ANSI CSI sequences. The control-char in the regex is deliberate.
  // eslint-disable-next-line no-control-regex
  s = s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
  // Drop lone C0 controls (keep tab, LF, CR). Same rationale.
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  if (s.length > maxLength) s = s.slice(0, maxLength) + '…'
  return s.length ? s : fallback
}

function statusRun(status) {
  const label =
    STATUS_LABEL[status] ?? String(status ?? 'unknown').toUpperCase()
  return new TextRun({ text: sanitizeText(label), bold: true, size: 18 })
}

function cell(children, { fill } = {}) {
  return new TableCell({
    shading: fill
      ? { type: ShadingType.CLEAR, fill, color: 'auto' }
      : undefined,
    children
  })
}

function summaryTableParagraphs(testResults) {
  if (!Array.isArray(testResults) || testResults.length === 0) return []

  const counts = testResults.reduce((acc, r) => {
    const key = r.status ?? 'unknown'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
  const summaryLine = sanitizeText(
    Object.entries(counts)
      .map(([k, v]) => `${STATUS_LABEL[k] ?? k}: ${v}`)
      .join('   ·   '),
    { maxLength: 200 }
  )

  const header = new TableRow({
    tableHeader: true,
    children: [
      cell(
        [
          new Paragraph({
            children: [new TextRun({ text: 'Test', bold: true, size: 18 })]
          })
        ],
        { fill: 'CFD8DC' }
      ),
      cell(
        [
          new Paragraph({
            children: [new TextRun({ text: 'Status', bold: true, size: 18 })]
          })
        ],
        { fill: 'CFD8DC' }
      ),
      cell(
        [
          new Paragraph({
            children: [new TextRun({ text: 'Duration', bold: true, size: 18 })]
          })
        ],
        { fill: 'CFD8DC' }
      ),
      cell(
        [
          new Paragraph({
            children: [new TextRun({ text: 'Detail', bold: true, size: 18 })]
          })
        ],
        { fill: 'CFD8DC' }
      )
    ]
  })

  const rows = testResults.map(
    (r) =>
      new TableRow({
        children: [
          cell([
            new Paragraph({
              children: [
                new TextRun({
                  text: sanitizeText(r.title, { maxLength: 300 }),
                  size: 16
                })
              ]
            })
          ]),
          cell([new Paragraph({ children: [statusRun(r.status)] })], {
            fill: STATUS_COLOR[r.status]
          }),
          cell([
            new Paragraph({
              children: [
                new TextRun({
                  text: sanitizeText(
                    r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : '—',
                    { maxLength: 20 }
                  ),
                  size: 16
                })
              ]
            })
          ]),
          cell([
            new Paragraph({
              children: [
                new TextRun({
                  text: sanitizeText(r.error, {
                    fallback: '—',
                    maxLength: 400
                  }),
                  size: 14,
                  color: r.status === 'passed' ? '607D8B' : 'B71C1C'
                })
              ]
            })
          ])
        ]
      })
  )

  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun('Test summary')]
    }),
    new Paragraph({ children: [new TextRun({ text: summaryLine, size: 20 })] }),
    new Paragraph({ children: [new TextRun('')] }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [header, ...rows]
    }),
    new Paragraph({ children: [new PageBreak()] })
  ]
}

async function loadTranscriptParagraphs(transcriptsDir) {
  if (!transcriptsDir) return []
  let entries
  try {
    entries = await readdir(transcriptsDir)
  } catch {
    return []
  }
  const txts = entries.filter((f) => f.endsWith('.txt')).sort()
  const paragraphs = []
  for (let i = 0; i < txts.length; i += 1) {
    const file = txts[i]
    const fullPath = path.join(transcriptsDir, file)
    const raw = await readFile(fullPath, 'utf8')
    paragraphs.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun(`Transcript: ${file}`)]
      })
    )
    // Preserve line breaks: emit one Paragraph per source line, each rendered
    // in a monospace font with a light grey background so it reads as a code
    // block in Word rather than reflowing as prose. Sanitize per-line so any
    // control chars in captured HTTP bodies don't corrupt the doc.
    for (const line of raw.split(/\r?\n/)) {
      paragraphs.push(
        new Paragraph({
          shading: {
            type: ShadingType.CLEAR,
            fill: 'F5F5F5',
            color: 'auto'
          },
          children: [
            new TextRun({
              text: sanitizeText(line, { maxLength: 4000 }),
              font: 'Courier New',
              size: 18
            })
          ]
        })
      )
    }
    if (i < txts.length - 1) {
      paragraphs.push(new Paragraph({ children: [new PageBreak()] }))
    }
  }
  return paragraphs
}

async function loadImageParagraphs(screenshotsDir) {
  let entries
  try {
    entries = await readdir(screenshotsDir)
  } catch {
    return []
  }
  const pngs = entries.filter((f) => f.endsWith('.png')).sort()
  const paragraphs = []
  for (let i = 0; i < pngs.length; i += 1) {
    const file = pngs[i]
    const fullPath = path.join(screenshotsDir, file)
    const caption = await readCaption(fullPath)
    const data = await readFile(fullPath)
    paragraphs.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun(`Step ${i + 1}: ${caption}`)]
      })
    )
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data,
            transformation: fittedDimensions(data),
            type: 'png'
          })
        ]
      })
    )
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: file, italics: true, size: 16 })]
      })
    )
    if (i < pngs.length - 1) {
      paragraphs.push(new Paragraph({ children: [new PageBreak()] }))
    }
  }
  return paragraphs
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

function headerRow(labels) {
  return new TableRow({
    tableHeader: true,
    children: labels.map((label) =>
      cell(
        [
          new Paragraph({
            children: [new TextRun({ text: label, bold: true, size: 18 })]
          })
        ],
        { fill: 'CFD8DC' }
      )
    )
  })
}

function textCell(text, opts = {}) {
  return cell(
    [
      new Paragraph({
        children: [
          new TextRun({ text: sanitizeText(text, { fallback: '—' }), size: 16 })
        ]
      })
    ],
    opts
  )
}

const EMAIL_STATUS = {
  RECEIVED: { label: 'RECEIVED', fill: STATUS_COLOR.passed },
  NOT_FOUND: { label: 'NOT RECEIVED', fill: STATUS_COLOR.failed },
  PENDING: { label: 'PENDING CAPTURE', fill: STATUS_COLOR.interrupted }
}

// Notification-email evidence. emails/expected.json (written by the CSoC
// runner) lists every email the journey should have triggered; each
// recipient's <file>.json is written when the email is captured from the
// mailbox, and <file>.png is its rendered screenshot. Anything expected but
// not captured is still listed so a gap is visible rather than silently
// missing from the pack.
async function loadEmailParagraphs(emailsDir) {
  if (!emailsDir) return []
  const expected = await readJson(path.join(emailsDir, 'expected.json'))
  if (!Array.isArray(expected) || expected.length === 0) return []

  const items = []
  for (const entry of expected) {
    for (const recipient of entry.recipients ?? []) {
      const meta = await readJson(
        path.join(emailsDir, `${recipient.file}.json`)
      )
      let status = 'PENDING'
      if (meta) status = meta.status === 'NOT_FOUND' ? 'NOT_FOUND' : 'RECEIVED'
      let png = null
      try {
        png = await readFile(path.join(emailsDir, `${recipient.file}.png`))
      } catch {
        png = null
      }
      items.push({ entry, recipient, meta, status, png })
    }
  }

  const received = items.filter((i) => i.status === 'RECEIVED').length
  const rows = items.map(
    ({ entry, recipient, meta, status }) =>
      new TableRow({
        children: [
          textCell(entry.trigger),
          textCell(`${recipient.role}: ${recipient.address}`),
          textCell(meta?.subject),
          textCell(meta?.date),
          cell(
            [
              new Paragraph({
                children: [
                  new TextRun({
                    text: EMAIL_STATUS[status].label,
                    bold: true,
                    size: 18
                  })
                ]
              })
            ],
            { fill: EMAIL_STATUS[status].fill }
          )
        ]
      })
  )

  const paragraphs = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun('Notification emails')]
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Emails: ${received}/${items.length} received`,
          size: 20
        })
      ]
    }),
    new Paragraph({ children: [new TextRun('')] }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        headerRow(['Trigger', 'Recipient', 'Subject', 'Received', 'Status']),
        ...rows
      ]
    })
  ]

  let n = 0
  for (const { entry, recipient, meta, status, png } of items) {
    n += 1
    paragraphs.push(new Paragraph({ children: [new PageBreak()] }))
    paragraphs.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [
          new TextRun(
            sanitizeText(`Email ${n}: ${entry.trigger} → ${recipient.role}`)
          )
        ]
      })
    )
    if (png) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: png,
              transformation: fittedDimensions(png),
              type: 'png'
            })
          ]
        })
      )
    } else {
      const reason =
        status === 'NOT_FOUND'
          ? `No email to ${recipient.address} found in the mailbox between ${entry.after} and ${entry.before}.`
          : 'Email not yet captured from the mailbox.'
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: sanitizeText(reason),
              bold: true,
              color: status === 'NOT_FOUND' ? 'C62828' : 'E65100',
              size: 20
            })
          ]
        })
      )
    }
    const footer = [
      meta?.messageId && `Gmail message id: ${meta.messageId}`,
      meta?.query && `Search: ${meta.query}`,
      meta?.error && `Error: ${meta.error}`
    ].filter(Boolean)
    for (const line of footer) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: sanitizeText(line), italics: true, size: 16 })
          ]
        })
      )
    }
  }
  return paragraphs
}

function coverParagraphs({
  title,
  journey,
  regulator,
  orgType,
  timestamp,
  status
}) {
  return [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun(title)]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `${journey} · ${regulator} · ${orgType}`,
          bold: true,
          size: 32
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Run: ${timestamp}`, size: 22 })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Status: ${status}`,
          bold: true,
          color: status === 'PASSED' ? '2E7D32' : 'C62828',
          size: 22
        })
      ]
    }),
    new Paragraph({ children: [new PageBreak()] })
  ]
}

export async function buildEvidenceDoc({
  screenshotsDir,
  transcriptsDir,
  emailsDir,
  outputPath,
  journey,
  regulator,
  orgType,
  timestamp,
  status,
  title = 'CSoC E2E Evidence Pack',
  testResults
}) {
  const cover = coverParagraphs({
    title,
    journey,
    regulator,
    orgType,
    timestamp,
    status
  })
  const summary = summaryTableParagraphs(testResults)
  const transcripts = await loadTranscriptParagraphs(transcriptsDir)
  const images = await loadImageParagraphs(screenshotsDir)
  const emails = await loadEmailParagraphs(emailsDir)
  // Transcripts first so security evidence leads with the raw HTTP proof;
  // screenshots follow to demonstrate UI behaviour, then any notification
  // emails the journey triggered.
  const body = [transcripts, images, emails]
    .filter((group) => group.length)
    .flatMap((group, i) =>
      i === 0
        ? group
        : [new Paragraph({ children: [new PageBreak()] }), ...group]
    )
  const doc = new Document({
    creator: 'waste-obligations-journey-tests',
    title: `${title} — ${journey} ${regulator} ${orgType}`,
    description: 'Automated evidence pack',
    sections: [{ children: [...cover, ...summary, ...body] }]
  })
  const buffer = await Packer.toBuffer(doc)
  await writeFile(outputPath, buffer)
  return outputPath
}
