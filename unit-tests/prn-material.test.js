import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listMaterialText } from '../utils/prn-material.js'

test('list rows name materials as the frontend list does', () => {
  assert.equal(listMaterialText('Glass'), 'Glass Other')
  assert.equal(listMaterialText('GlassRemelt'), 'Glass Re-melt')
  assert.equal(listMaterialText('Paper'), 'Paper or board')
  assert.equal(listMaterialText('Fibre'), 'Fibre-based composite material')
  assert.equal(listMaterialText('Aluminium'), 'Aluminium')
})

test('row names read in the same order as the API names', () => {
  const apiNames = [
    'Aluminium',
    'Fibre',
    'Glass',
    'GlassRemelt',
    'Paper',
    'Plastic',
    'Steel',
    'Wood'
  ]
  const rowNames = apiNames.map(listMaterialText)

  assert.deepEqual(
    rowNames,
    [...rowNames].sort((a, b) => a.localeCompare(b))
  )
})

test('materials the list has no name for keep the API name', () => {
  assert.equal(listMaterialText('Copper'), 'Copper')
})
