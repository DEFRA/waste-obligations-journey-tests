import { test } from 'node:test'
import assert from 'node:assert/strict'
import { looksLikePdf, mentions, pdfPageCount } from '../utils/pdf-download.js'

test('a file starting with the PDF header is a PDF', () => {
  assert.equal(looksLikePdf(Buffer.from('%PDF-1.3\n...')), true)
  assert.equal(looksLikePdf(Buffer.from('<html>')), false)
  assert.equal(looksLikePdf(Buffer.alloc(0)), false)
})

test('page objects are counted, the page tree is not', () => {
  const body = '<< /Type /Pages /Count 2 >> << /Type /Page >> << /Type /Page >>'
  assert.equal(pdfPageCount(Buffer.from(body)), 2)
  assert.equal(pdfPageCount(Buffer.from('no pages here')), 0)
})

test('mentions ignores case, punctuation and spacing', () => {
  assert.equal(
    mentions(
      'Accepted  towards 2027\nrecycling obligations',
      'accepted towards 2027 recycling obligations'
    ),
    true
  )
  assert.equal(mentions('PRN number: DPL26MO332A', 'DPL26MO332A'), true)
})

test('mentions allows OCR slips only up to the tolerance', () => {
  assert.equal(mentions('PRN number: DPL26M0332A', 'DPL26MO332A', 0), false)
  assert.equal(mentions('PRN number: DPL26M0332A', 'DPL26MO332A', 1), true)
  assert.equal(mentions('PRN number: XXXXXMO332A', 'DPL26MO332A', 1), false)
})

test('mentions is false when the text is missing', () => {
  assert.equal(mentions('Accept this PRN', 'Reject this PRN', 2), false)
})
