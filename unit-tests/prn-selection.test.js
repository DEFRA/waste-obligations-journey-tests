import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getComplianceYear, getJourneyNow } from '../utils/journey-clock.js'
import {
  findPrnAcceptableInto,
  findStandardSelectablePrn,
  findStandardSelectablePrnsByMaterial,
  getComplianceYear,
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

test('finds a standard PRN for each material, leaving out materials with none', () => {
  const paper = { ...standard2026, number: 'PAPER', material: 'Paper' }
  const fibre = { ...standard2026, number: 'FIBRE', material: 'Fibre' }
  const oldGlass = { ...standard2025, number: 'GLASS', material: 'Glass' }
  const decemberRemelt = {
    ...december2026,
    number: 'REMELT',
    material: 'GlassRemelt'
  }

  assert.deepEqual(
    findStandardSelectablePrnsByMaterial(
      [paper, fibre, oldGlass, decemberRemelt],
      ['Paper', 'Fibre', 'Glass', 'GlassRemelt'],
      inSeptember2026
    ),
    { Paper: paper, Fibre: fibre }
  )
})

test('a standard note is acceptable only into the current compliance year', () => {
  const now = new Date('2026-10-19T12:00:00Z')
  assert.deepEqual(resolveAcceptanceYears(standard2026, now), [2026])
  assert.deepEqual(resolveAcceptanceYears(standard2025, now), [])
  assert.deepEqual(
    resolveAcceptanceYears({ ...standard2026, obligationYear: 2027 }, now),
    []
  )
})

test('december waste is offered both years only inside its window', () => {
  const beforeWindow = new Date('2026-11-30T23:59:59Z')
  const windowOpens = new Date('2026-12-01T00:00:00Z')
  const lastSecond = new Date('2027-01-31T23:59:59Z')
  const afterWindow = new Date('2027-02-01T00:00:01Z')

  assert.deepEqual(resolveAcceptanceYears(december2026, beforeWindow), [2026])
  assert.deepEqual(
    resolveAcceptanceYears(december2026, windowOpens),
    [2026, 2027]
  )
  assert.deepEqual(
    resolveAcceptanceYears(december2026, lastSecond),
    [2026, 2027]
  )
  assert.deepEqual(resolveAcceptanceYears(december2026, afterWindow), [2027])
})

test('2025 december waste never offers a choice and then expires', () => {
  const december2025 = { decemberWaste: true, obligationYear: 2025 }
  assert.deepEqual(
    resolveAcceptanceYears(december2025, new Date('2026-06-01T00:00:00Z')),
    [2026]
  )
  assert.deepEqual(
    resolveAcceptanceYears(december2025, new Date('2027-06-01T00:00:00Z')),
    []
  )
})

test('findPrnAcceptableInto returns the first note the year list offers', () => {
  const now = new Date('2027-02-01T00:00:01Z')
  const dec = { ...december2026, number: 'DEC' }
  const std2027 = { ...standard2026, number: 'NEW', obligationYear: 2027 }

  assert.equal(findPrnAcceptableInto([standard2026, dec], 2027, now), dec)
  assert.equal(
    findPrnAcceptableInto([standard2026, std2027], 2027, now),
    std2027
  )
  assert.equal(findPrnAcceptableInto([standard2026], 2027, now), undefined)
})
