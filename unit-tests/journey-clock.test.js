import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canSubmitDeclarations,
  getComplianceYear,
  getJourneyNow,
  issueDateInComplianceYear,
  inDecemberWasteWindow
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

test('fixture issue dates fall in the compliance year, before now, in their order', () => {
  const now = new Date('2027-03-10T12:00:00Z')
  const fixtures = [
    '2026-02-12T10:10:00Z',
    '2026-03-30T16:05:00Z',
    '2026-06-15T10:30:00Z'
  ]
  const issued = fixtures.map((date) => issueDateInComplianceYear(date, now))

  for (const date of issued) {
    assert.ok(Date.parse(date) >= Date.parse('2027-02-01T00:00:00Z'), date)
    assert.ok(Date.parse(date) < now.getTime(), date)
  }
  assert.deepEqual([...issued].sort(), issued)
})

test('in January, fixture issue dates stay in the previous compliance year', () => {
  const now = new Date('2027-01-20T12:00:00Z')
  const issued = issueDateInComplianceYear('2026-06-15T10:30:00Z', now)

  assert.ok(issued.startsWith('2026-'), issued)
  assert.ok(Date.parse(issued) < now.getTime(), issued)
})

test('the December waste window runs from 1 December to the end of January', () => {
  const at = (iso) => new Date(iso)

  assert.equal(inDecemberWasteWindow(2026, at('2026-11-30T23:59:59Z')), false)
  assert.equal(inDecemberWasteWindow(2026, at('2026-12-01T00:00:00Z')), true)
  assert.equal(inDecemberWasteWindow(2026, at('2026-12-15T12:00:00Z')), true)
  assert.equal(inDecemberWasteWindow(2026, at('2027-01-31T23:59:59Z')), true)
  assert.equal(inDecemberWasteWindow(2026, at('2027-02-01T00:00:00Z')), false)
})

test('the December waste window defaults to the scenario clock', () => {
  assert.equal(
    inDecemberWasteWindow(
      2026,
      getJourneyNow({ JOURNEY_NOW: '2026-12-15T09:00:00Z' })
    ),
    true
  )
})
