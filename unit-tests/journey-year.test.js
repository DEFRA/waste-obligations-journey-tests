import test from 'node:test'
import assert from 'node:assert/strict'
import { getJourneyYear } from '../utils/journey-year.js'

test('defaults to 2026 when JOURNEY_YEAR is unset or empty', () => {
  assert.equal(getJourneyYear({}), 2026)
  assert.equal(getJourneyYear({ JOURNEY_YEAR: '' }), 2026)
})

test('uses JOURNEY_YEAR when it is a whole year', () => {
  assert.equal(getJourneyYear({ JOURNEY_YEAR: '2027' }), 2027)
})

test('rejects a non-numeric JOURNEY_YEAR', () => {
  assert.throws(() => getJourneyYear({ JOURNEY_YEAR: 'next' }), /JOURNEY_YEAR/)
})
