import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  acceptedHeading,
  acceptedTonnageByMaterial,
  expectedAcceptedTiles,
  findBulkAcceptPrns,
  parseTonnage,
  tonnageText
} from '../utils/bulk-accept.js'

const OCTOBER_2026 = new Date('2026-10-15T12:00:00Z')

function prn(number, material, overrides = {}) {
  return {
    number,
    material,
    tonnage: 10,
    obligationYear: 2026,
    decemberWaste: false,
    ...overrides
  }
}

test('finds the first standard current-year PRN for each material', () => {
  const prns = [
    prn('PRN1', 'Paper', { decemberWaste: true }),
    prn('PRN2', 'Paper'),
    prn('PRN3', 'Fibre', { obligationYear: 2025 }),
    prn('PRN4', 'Fibre'),
    prn('PRN5', 'Glass'),
    prn('PRN6', 'GlassRemelt'),
    prn('PRN7', 'Paper')
  ]

  const found = findBulkAcceptPrns(prns, OCTOBER_2026)

  assert.deepEqual(
    Object.fromEntries(
      Object.entries(found).map(([material, { number }]) => [material, number])
    ),
    { Paper: 'PRN2', Fibre: 'PRN4', Glass: 'PRN5', GlassRemelt: 'PRN6' }
  )
})

test('leaves out a material with no selectable PRN', () => {
  const found = findBulkAcceptPrns([prn('PRN1', 'Paper')], OCTOBER_2026)

  assert.deepEqual(Object.keys(found), ['Paper'])
})

test('groups paper and fibre into one paper tile with their total tonnage', () => {
  const tiles = expectedAcceptedTiles([
    prn('PRN1', 'Paper', { tonnage: 15 }),
    prn('PRN2', 'Fibre', { tonnage: 35 }),
    prn('PRN3', 'GlassRemelt', { tonnage: 220 })
  ])

  assert.deepEqual(tiles, [
    {
      material: 'Paper',
      label: 'Paper, board or fibre-based composite material',
      tonnage: 50,
      tonnageText: '50 tonnes',
      description:
        'accepted towards your recycling obligation for paper, board or fibre-based composite material'
    },
    {
      material: 'GlassRemelt',
      label: 'Glass remelt',
      tonnage: 220,
      tonnageText: '220 tonnes',
      description: 'accepted towards your recycling obligation for glass remelt'
    }
  ])
})

test('uses tonne for exactly one tonne', () => {
  assert.equal(tonnageText(1), '1 tonne')
  assert.equal(tonnageText(2), '2 tonnes')
})

test('words the confirmation heading for one or several PRNs', () => {
  assert.equal(
    acceptedHeading(3, 2026),
    'You’ve accepted 3 PRNs and PERNs towards your 2026 recycling obligations'
  )
  assert.equal(
    acceptedHeading(1, 2026),
    'You’ve accepted 1 PRN or PERN towards your 2026 recycling obligations'
  )
})

test('reads the accepted tonnage per material from the obligations API', () => {
  assert.deepEqual(
    acceptedTonnageByMaterial([
      { material: 'Paper', tonnages: { accepted: 1 } },
      { material: 'GlassRemelt', tonnages: { accepted: 0 } },
      { material: 'Wood' }
    ]),
    { Paper: 1, GlassRemelt: 0, Wood: 0 }
  )
})

test('parses tonnage with thousands separators', () => {
  assert.equal(parseTonnage('1,234'), 1234)
  assert.equal(parseTonnage(' 51 '), 51)
})
