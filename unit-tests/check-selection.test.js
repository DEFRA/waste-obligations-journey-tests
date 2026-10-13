import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PAPER_GROUP_HEADING,
  checkSelectionGroupHeading,
  expectedCheckSelectionGroups,
  findPaperAndFibreRows
} from '../utils/check-selection.js'

test('material headings use the list filter labels', () => {
  assert.equal(checkSelectionGroupHeading('Aluminium'), 'Aluminium')
  assert.equal(checkSelectionGroupHeading('Glass'), 'Glass other')
  assert.equal(checkSelectionGroupHeading('GlassRemelt'), 'Glass re-melt')
  assert.equal(checkSelectionGroupHeading('Plastic'), 'Plastic')
  assert.equal(checkSelectionGroupHeading('Steel'), 'Steel')
  assert.equal(checkSelectionGroupHeading('Wood'), 'Wood')
})

test('paper and fibre variants share the paper heading', () => {
  for (const material of ['Paper', 'Fibre', 'Fiber', 'PaperBoard', 'fibre']) {
    assert.equal(checkSelectionGroupHeading(material), PAPER_GROUP_HEADING)
  }
})

test('an unknown material is its own heading', () => {
  assert.equal(checkSelectionGroupHeading('Copper'), 'Copper')
})

test('groups rows by heading with per-group totals, in filter order', () => {
  const groups = expectedCheckSelectionGroups([
    { number: 'PRN1', material: 'Steel', tonnageValue: 510 },
    { number: 'PRN2', material: 'Aluminium', tonnageValue: 125 },
    { number: 'PRN3', material: 'Fibre', tonnageValue: 5 },
    { number: 'PRN4', material: 'Aluminium', tonnageValue: 90 },
    { number: 'PRN5', material: 'Paper', tonnageValue: 15 },
    { number: 'PRN6', material: 'Copper', tonnageValue: 1 }
  ])

  assert.deepEqual(groups, [
    { heading: 'Aluminium', numbers: ['PRN2', 'PRN4'], total: 215 },
    { heading: PAPER_GROUP_HEADING, numbers: ['PRN3', 'PRN5'], total: 20 },
    { heading: 'Steel', numbers: ['PRN1'], total: 510 },
    { heading: 'Copper', numbers: ['PRN6'], total: 1 }
  ])
})

test('no rows means no groups', () => {
  assert.deepEqual(expectedCheckSelectionGroups([]), [])
})

test('finds the first paper row and the first fibre row', () => {
  const rows = [
    { number: 'PRN1', material: 'Steel' },
    { number: 'PRN2', material: 'Fibre' },
    { number: 'PRN3', material: 'Paper' },
    { number: 'PRN4', material: 'Paper' },
    { number: 'PRN5', material: 'Fiber' }
  ]

  const { paper, fibre } = findPaperAndFibreRows(rows)

  assert.equal(paper.number, 'PRN3')
  assert.equal(fibre.number, 'PRN2')
})

test('reports a missing paper or fibre row as undefined', () => {
  assert.deepEqual(
    findPaperAndFibreRows([{ number: 'PRN1', material: 'Paper' }]),
    { paper: { number: 'PRN1', material: 'Paper' }, fibre: undefined }
  )
  assert.deepEqual(findPaperAndFibreRows([]), {
    paper: undefined,
    fibre: undefined
  })
})
