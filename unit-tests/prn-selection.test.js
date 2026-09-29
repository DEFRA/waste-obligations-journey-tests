import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  findStandardSelectablePrn,
  getComplianceYear
} from '../utils/prn-selection.js'

test('compliance year assigns January to the previous year', () => {
  assert.equal(getComplianceYear(new Date('2027-01-31T12:00:00Z')), 2026)
  assert.equal(getComplianceYear(new Date('2027-02-01T12:00:00Z')), 2027)
  assert.equal(getComplianceYear(new Date('2026-12-31T12:00:00Z')), 2026)
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
