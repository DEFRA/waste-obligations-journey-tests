import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  expectedAnalyticsCookiePath,
  setTestGaCookies,
  TEST_GA4_COOKIE_NAME
} from '../utils/analytics.js'

test('analytics cookie path follows the public service prefix', () => {
  assert.equal(expectedAnalyticsCookiePath('https://localhost:8015/'), '/')
  assert.equal(
    expectedAnalyticsCookiePath(
      'https://localhost:8015/manage-recycling-obligations/'
    ),
    '/manage-recycling-obligations'
  )
})

test('setTestGaCookies uses domain and path without url', async () => {
  const added = []
  const page = {
    url: () => 'https://localhost:8015/manage-recycling-obligations/signed-out',
    evaluate: async () => '/manage-recycling-obligations',
    context: () => ({
      addCookies: async (cookies) => {
        added.push(...cookies)
      }
    })
  }

  await setTestGaCookies(page)

  assert.equal(added.length, 2)
  assert.deepEqual(
    added.map((cookie) => cookie.name),
    ['_ga', TEST_GA4_COOKIE_NAME]
  )

  for (const cookie of added) {
    assert.equal(cookie.domain, 'localhost')
    assert.equal(cookie.path, '/manage-recycling-obligations')
    assert.equal(cookie.secure, true)
    assert.equal('url' in cookie, false)
  }
})
