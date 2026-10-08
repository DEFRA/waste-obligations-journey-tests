import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  expectedDecemberWasteFlashText,
  isInDecemberJanuaryFlashWindow
} from '../utils/december-waste-flash.js'

const awaitingDecemberWaste = {
  status: 'AwaitingAcceptance',
  decemberWaste: true,
  obligationYear: 2026,
  issuedAt: '2026-12-05T00:00:00Z'
}

test('the flash window is UK December and January only', () => {
  assert.equal(
    isInDecemberJanuaryFlashWindow(new Date('2026-11-30T23:59:59Z')),
    false
  )
  assert.equal(
    isInDecemberJanuaryFlashWindow(new Date('2026-12-01T00:00:00Z')),
    true
  )
  assert.equal(
    isInDecemberJanuaryFlashWindow(new Date('2027-01-31T23:59:59Z')),
    true
  )
  assert.equal(
    isInDecemberJanuaryFlashWindow(new Date('2027-02-01T00:00:00Z')),
    false
  )
})

test('an in-window December waste PRN with two years flashes', () => {
  assert.equal(
    expectedDecemberWasteFlashText(
      awaitingDecemberWaste,
      new Date('2026-12-15T12:00:00Z')
    ),
    'Can be accepted towards 2026 or 2027'
  )
  assert.equal(
    expectedDecemberWasteFlashText(
      { ...awaitingDecemberWaste, issuedAt: '2027-01-12T00:00:00Z' },
      new Date('2027-01-15T12:00:00Z')
    ),
    'Can be accepted towards 2026 or 2027'
  )
})

test('no flash from February to November', () => {
  assert.equal(
    expectedDecemberWasteFlashText(
      awaitingDecemberWaste,
      new Date('2026-10-08T12:00:00Z')
    ),
    null
  )
  assert.equal(
    expectedDecemberWasteFlashText(
      awaitingDecemberWaste,
      new Date('2027-02-01T00:00:00Z')
    ),
    null
  )
})

test('no flash for standard, accepted, stale or single-year PRNs', () => {
  const now = new Date('2026-12-15T12:00:00Z')
  assert.equal(
    expectedDecemberWasteFlashText(
      { ...awaitingDecemberWaste, decemberWaste: false },
      now
    ),
    null
  )
  assert.equal(
    expectedDecemberWasteFlashText(
      { ...awaitingDecemberWaste, status: 'Accepted' },
      now
    ),
    null
  )
  // issued in the previous year's window
  assert.equal(
    expectedDecemberWasteFlashText(
      {
        ...awaitingDecemberWaste,
        obligationYear: 2025,
        issuedAt: '2025-12-10T00:00:00Z'
      },
      now
    ),
    null
  )
  // 2025 December waste offers a single year, so no choice and no flash
  assert.equal(
    expectedDecemberWasteFlashText(
      {
        ...awaitingDecemberWaste,
        obligationYear: 2025,
        issuedAt: '2025-12-10T00:00:00Z'
      },
      new Date('2025-12-15T12:00:00Z')
    ),
    null
  )
})

test('an unparseable issue date never flashes', () => {
  assert.equal(
    expectedDecemberWasteFlashText(
      { ...awaitingDecemberWaste, issuedAt: 'not-a-date' },
      new Date('2026-12-15T12:00:00Z')
    ),
    null
  )
})
