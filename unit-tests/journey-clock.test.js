import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canSubmitDeclarations,
  getComplianceYear,
  getJourneyNow
} from '../utils/journey-clock.js'

const realNow = () => new Date('2026-10-19T12:00:00Z')

test('the scenario clock is the real date when JOURNEY_NOW is unset or empty', () => {
  assert.equal(
    getJourneyNow({}, realNow).toISOString(),
    realNow().toISOString()
  )
  assert.equal(
    getJourneyNow({ JOURNEY_NOW: '' }, realNow).toISOString(),
    realNow().toISOString()
  )
})

test('the scenario clock is JOURNEY_NOW when it is a timestamp', () => {
  assert.equal(
    getJourneyNow(
      { JOURNEY_NOW: '2027-02-01T00:00:01Z' },
      realNow
    ).toISOString(),
    '2027-02-01T00:00:01.000Z'
  )
})

test('a malformed JOURNEY_NOW is rejected', () => {
  assert.throws(
    () => getJourneyNow({ JOURNEY_NOW: 'soon' }, realNow),
    /JOURNEY_NOW/
  )
})

test('compliance year assigns January to the previous year', () => {
  assert.equal(getComplianceYear(new Date('2027-01-31T12:00:00Z')), 2026)
  assert.equal(getComplianceYear(new Date('2027-02-01T12:00:00Z')), 2027)
  assert.equal(getComplianceYear(new Date('2026-12-31T12:00:00Z')), 2026)
})

test('declarations can be submitted while the scenario stays in the real compliance year', () => {
  assert.equal(canSubmitDeclarations({}, realNow), true)
  assert.equal(
    canSubmitDeclarations({ JOURNEY_NOW: '2026-12-15T12:00:00Z' }, realNow),
    true
  )
})

test('declarations cannot be submitted once the scenario moves into another compliance year', () => {
  assert.equal(
    canSubmitDeclarations({ JOURNEY_NOW: '2027-02-01T00:00:01Z' }, realNow),
    false
  )
  assert.equal(
    canSubmitDeclarations({ JOURNEY_NOW: '2027-12-15T12:00:00Z' }, realNow),
    false
  )
})
