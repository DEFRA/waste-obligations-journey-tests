import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  acceptedHeading,
  expectedAcceptedTiles,
  expectedObligationChanges,
  parseTonnage,
  tonnageText
} from '../utils/bulk-accept.js'

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

test('groups paper and fibre into one paper tile with their total tonnage', () => {
  const tiles = expectedAcceptedTiles([
    prn('PRN1', 'Paper', { tonnage: 15 }),
    prn('PRN2', 'Fibre', { tonnage: 35 }),
    prn('PRN3', 'GlassRemelt', { tonnage: 220 })
  ])

  assert.deepEqual(tiles, [
    {
      material: 'GlassRemelt',
      label: 'Glass remelt',
      tonnage: 220,
      tonnageText: '220 tonnes',
      description: 'accepted towards your recycling obligation for glass remelt'
    },
    {
      material: 'Paper',
      label: 'Paper, board or fibre-based composite material',
      tonnage: 50,
      tonnageText: '50 tonnes',
      description:
        'accepted towards your recycling obligation for paper, board or fibre-based composite material'
    }
  ])
})

test('orders the tiles like the material filter, whatever the selection order', () => {
  const tiles = expectedAcceptedTiles([
    prn('PRN1', 'Paper'),
    prn('PRN2', 'GlassRemelt'),
    prn('PERN3', 'Aluminium'),
    prn('PRN4', 'Glass')
  ])

  assert.deepEqual(
    tiles.map((tile) => tile.material),
    ['Aluminium', 'Glass', 'GlassRemelt', 'Paper']
  )
})

test('moves each row, the Glass row and Totals by the accepted tonnage', () => {
  assert.deepEqual(
    expectedObligationChanges([
      prn('PRN1', 'Paper', { tonnage: 15 }),
      prn('PRN2', 'Fibre', { tonnage: 35 }),
      prn('PRN3', 'Glass', { tonnage: 75 }),
      prn('PRN4', 'GlassRemelt', { tonnage: 220 })
    ]),
    {
      'Paper, board or fibre-based composite material': 50,
      'Remaining glass': 75,
      'Glass remelt': 220,
      Glass: 295,
      Totals: 345
    }
  )
})

test('a selection without glass leaves the Glass row out', () => {
  assert.deepEqual(
    expectedObligationChanges([prn('PERN1', 'Aluminium', { tonnage: 15 })]),
    { Aluminium: 15, Totals: 15 }
  )
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

test('parses tonnage with thousands separators', () => {
  assert.equal(parseTonnage('1,234'), 1234)
  assert.equal(parseTonnage(' 51 '), 51)
})
