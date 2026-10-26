import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getComplianceYear, getJourneyNow } from '../utils/journey-clock.js'
import {
  findStandardSelectablePrn,
  noteType,
  PRN_ACCOUNTS,
  resolveAcceptanceYears
} from '../utils/prn-selection.js'

test('noteType maps PERN and treats every other type as a PRN', () => {
  assert.equal(noteType({ type: 'PERN' }), 'PERN')
  assert.equal(noteType({ type: 'PRN' }), 'PRN')
  assert.equal(noteType({}), 'PRN')
})

test('note accounts pair each login with the note type that login opens', () => {
  assert.deepEqual(
    PRN_ACCOUNTS.map(({ account, prnType }) => [account, prnType]),
    [
      ['dp', 'PRN'],
      ['cso', 'PERN']
    ]
  )
})

const standard2026 = {
  number: 'STD',
  decemberWaste: false,
  obligationYear: 2026
}
const december2026 = {
  number: 'DEC',
  decemberWaste: true,
  obligationYear: 2026
}
const standard2025 = {
  number: 'OLD',
  decemberWaste: false,
  obligationYear: 2025
}
const inSeptember2026 = new Date('2026-09-28T12:00:00Z')

test('acceptance years follow a JOURNEY_NOW clock rather than the machine date', () => {
  const now = getJourneyNow({ JOURNEY_NOW: '2027-02-01T00:00:01Z' })

  assert.equal(getComplianceYear(now), 2027)
  assert.deepEqual(resolveAcceptanceYears(standard2026, now), [])
})

test('finds a standard PRN in the current compliance year', () => {
  assert.equal(
    findStandardSelectablePrn(
      [december2026, standard2025, standard2026],
      inSeptember2026
    ),
    standard2026
  )
})

test('ignores December waste and other years', () => {
  assert.equal(
    findStandardSelectablePrn([december2026, standard2025], inSeptember2026),
    undefined
  )
})

test('a 2026 standard PRN is no longer selectable once 2027 begins', () => {
  assert.equal(
    findStandardSelectablePrn([standard2026], new Date('2027-02-01T12:00:00Z')),
    undefined
  )
})
