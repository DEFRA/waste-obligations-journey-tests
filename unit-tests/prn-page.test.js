import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatTonnes } from '../pages/prn-page.js'

test('formatTonnes uses the singular for exactly 1 tonne', () => {
  assert.equal(formatTonnes(1), '1 tonne')
})

test('formatTonnes uses the plural for more than 1 tonne', () => {
  assert.equal(formatTonnes(5), '5 tonnes')
})
