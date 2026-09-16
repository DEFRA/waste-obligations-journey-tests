import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expectedAnalyticsCookiePath } from '../utils/analytics.js'

test('analytics cookie path follows the public service prefix', () => {
  assert.equal(expectedAnalyticsCookiePath('https://localhost:8015/'), '/')
  assert.equal(
    expectedAnalyticsCookiePath(
      'https://localhost:8015/manage-recycling-obligations/'
    ),
    '/manage-recycling-obligations'
  )
})
