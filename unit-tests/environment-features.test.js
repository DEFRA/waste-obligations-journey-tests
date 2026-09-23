import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ANALYTICS_ACCEPT_BUTTON_NAME,
  PAGE_NOT_FOUND_HEADING,
  isFeatureFlagEnabled,
  readBooleanEnv,
  resolvePrnsAvailability,
  usesShowPrnsOnCdp
} from '../utils/environment-features.js'

test('analytics accept button name matches English and Welsh banner copy', () => {
  assert.match('Accept analytics cookies', ANALYTICS_ACCEPT_BUTTON_NAME)
  assert.match('Derbyn cwcis dadansoddeg', ANALYTICS_ACCEPT_BUTTON_NAME)
  assert.doesNotMatch('Reject analytics cookies', ANALYTICS_ACCEPT_BUTTON_NAME)
  assert.doesNotMatch('Gwrthod cwcis dadansoddeg', ANALYTICS_ACCEPT_BUTTON_NAME)
})

test('page not found heading matches English and Welsh 404 copy', () => {
  assert.match('Page not found', PAGE_NOT_FOUND_HEADING)
  assert.match('Heb ddod o hyd i’r dudalen', PAGE_NOT_FOUND_HEADING)
  assert.match("Heb ddod o hyd i'r dudalen", PAGE_NOT_FOUND_HEADING)
  assert.doesNotMatch('Accept or reject PRNs and PERNs', PAGE_NOT_FOUND_HEADING)
})

test('readBooleanEnv treats missing and blank values as unset', () => {
  assert.equal(readBooleanEnv('FEATURE_SHOW_PRNS', {}), undefined)
  assert.equal(
    readBooleanEnv('FEATURE_SHOW_PRNS', { FEATURE_SHOW_PRNS: '' }),
    undefined
  )
})

test('isFeatureFlagEnabled is true only for an explicit true value', () => {
  assert.equal(
    isFeatureFlagEnabled('FEATURE_CSOC_ENABLED', {
      FEATURE_CSOC_ENABLED: 'true'
    }),
    true
  )
  assert.equal(
    isFeatureFlagEnabled('FEATURE_CSOC_ENABLED', {
      FEATURE_CSOC_ENABLED: 'false'
    }),
    false
  )
  assert.equal(isFeatureFlagEnabled('FEATURE_CSOC_ENABLED', {}), false)
})

test('readBooleanEnv parses explicit true and false values', () => {
  assert.equal(
    readBooleanEnv('FEATURE_SHOW_PRNS', { FEATURE_SHOW_PRNS: 'true' }),
    true
  )
  assert.equal(
    readBooleanEnv('FEATURE_SHOW_PRNS', { FEATURE_SHOW_PRNS: 'TRUE' }),
    true
  )
  assert.equal(
    readBooleanEnv('FEATURE_SHOW_PRNS', { FEATURE_SHOW_PRNS: 'false' }),
    false
  )
})

test('resolvePrnsAvailability skips when the runner flag is false', () => {
  assert.deepEqual(
    resolvePrnsAvailability({ configured: false, pageShown: true }),
    {
      action: 'skip',
      reason: 'FEATURE_SHOW_PRNS is false for this environment'
    }
  )
})

test('resolvePrnsAvailability fails when the PRNs page is missing and the flag is not false', () => {
  assert.deepEqual(
    resolvePrnsAvailability({ configured: true, pageShown: false }),
    {
      action: 'fail',
      reason: 'FEATURE_SHOW_PRNS is enabled but the PRNs page was not found'
    }
  )
  assert.deepEqual(
    resolvePrnsAvailability({ configured: undefined, pageShown: false }),
    {
      action: 'fail',
      reason: 'FEATURE_SHOW_PRNS is enabled but the PRNs page was not found'
    }
  )
})

test('resolvePrnsAvailability runs when the PRNs page is shown', () => {
  assert.deepEqual(
    resolvePrnsAvailability({ configured: true, pageShown: true }),
    { action: 'run' }
  )
  assert.deepEqual(
    resolvePrnsAvailability({ configured: undefined, pageShown: true }),
    { action: 'run' }
  )
})

test('usesShowPrnsOnCdp follows FEATURE_SHOW_PRNS_ON_CDP in Packaging mode', () => {
  const keys = [
    'JOURNEY_ENTRY_POINT',
    'FEATURE_SHOW_PRNS',
    'FEATURE_SHOW_PRNS_ON_CDP'
  ]
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]])
  )

  try {
    process.env.JOURNEY_ENTRY_POINT = 'packaging'
    process.env.FEATURE_SHOW_PRNS = 'false'
    process.env.FEATURE_SHOW_PRNS_ON_CDP = 'true'
    assert.equal(usesShowPrnsOnCdp(), true)

    process.env.FEATURE_SHOW_PRNS = 'true'
    process.env.FEATURE_SHOW_PRNS_ON_CDP = 'false'
    assert.equal(usesShowPrnsOnCdp(), false)

    process.env.JOURNEY_ENTRY_POINT = 'waste-obligations'
    process.env.FEATURE_SHOW_PRNS_ON_CDP = 'true'
    assert.equal(usesShowPrnsOnCdp(), false)
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
  }
})
