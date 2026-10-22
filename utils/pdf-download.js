import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'

// Helpers for checking a PDF downloaded from the PRN page.
//
// The page is turned into a PDF in the browser from a picture of the page, so
// the file holds no selectable text. Its content can only be read back with OCR
// (`pdftoppm` and `tesseract`). Those tools are optional: without them the
// journeys still check the filename and that the file is a real PDF.

export function looksLikePdf(bytes) {
  return Buffer.from(bytes).subarray(0, 5).toString('latin1') === '%PDF-'
}

// Counts page objects without parsing the whole file.
export function pdfPageCount(bytes) {
  const text = Buffer.from(bytes).toString('latin1')
  return (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length
}

const normalise = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)

  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]
    row[0] = i

    for (let j = 1; j <= b.length; j++) {
      const current = row[j]
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
      previous = current
    }
  }

  return row[b.length]
}

/**
 * Whether `text` contains `needle`, allowing `tolerance` edits for OCR slips
 * (an O read as a 0, an l as a 1).
 */
export function mentions(text, needle, tolerance = 0) {
  const haystack = normalise(text)
  const wanted = normalise(needle)

  if (!wanted || haystack.includes(wanted)) {
    return true
  }

  if (tolerance === 0) {
    return false
  }

  for (let start = 0; start < haystack.length; start++) {
    for (const width of [wanted.length - 1, wanted.length, wanted.length + 1]) {
      const slice = haystack.slice(start, start + width)

      if (slice.length === width && editDistance(slice, wanted) <= tolerance) {
        return true
      }
    }
  }

  return false
}

export function isOcrAvailable() {
  return ['pdftoppm', 'tesseract'].every(
    (tool) => spawnSync('which', [tool]).status === 0
  )
}

/** The text of every page of the PDF at `file`, read back with OCR. */
export function ocrPdf(file) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'prn-pdf-'))
  const base = path.join(dir, 'page')

  execFileSync('pdftoppm', ['-r', '150', '-png', file, base])

  return readdirSync(dir)
    .filter((name) => name.endsWith('.png'))
    .sort()
    .map((name) =>
      execFileSync(
        'tesseract',
        [path.join(dir, name), 'stdout', '--psm', '6'],
        {
          stdio: ['ignore', 'pipe', 'ignore']
        }
      ).toString()
    )
    .join('\n')
}

export function readFileBytes(file) {
  return readFileSync(file)
}

// The filename and that the download is a real PDF; the content too, with OCR
// when pdftoppm and tesseract are installed.
export async function expectPdf(
  { filename, file },
  prn,
  { includes = [], excludes = [] } = {}
) {
  expect(filename, 'The PDF is named after the PRN number').toBe(
    `${prn.number}.pdf`
  )

  const bytes = readFileBytes(file)
  expect(looksLikePdf(bytes), 'The download is a PDF').toBe(true)
  expect(pdfPageCount(bytes), 'The PDF has at least one page').toBeGreaterThan(
    0
  )

  await expectPdfContent(file, prn, { includes, excludes })
}

export async function expectPdfContent(
  file,
  prn,
  { includes = [], excludes = [] } = {}
) {
  const ocrAvailable = isOcrAvailable()

  test.info().annotations.push({
    type: 'pdf-content',
    description: ocrAvailable
      ? 'Content read back with OCR'
      : 'pdftoppm or tesseract is not installed: the PDF content was not checked'
  })

  if (!ocrAvailable) {
    return
  }

  const text = ocrPdf(file)

  expect(mentions(text, prn.number, 2), `The PDF shows ${prn.number}`).toBe(
    true
  )
  expect(
    mentions(text, String(prn.tonnage)),
    `The PDF shows ${prn.tonnage} tonnes`
  ).toBe(true)

  for (const wanted of includes) {
    expect(mentions(text, wanted, 3), `The PDF says "${wanted}"`).toBe(true)
  }

  for (const excluded of excludes) {
    expect(mentions(text, excluded), `The PDF leaves out "${excluded}"`).toBe(
      false
    )
  }
}
