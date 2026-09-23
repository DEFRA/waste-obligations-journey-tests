import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  expectedAnalyticsCookiePath,
  ga4CookieNameFromMeasurementId,
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

test('ga4 cookie names follow the measurement ID on the page', () => {
  assert.equal(
    ga4CookieNameFromMeasurementId('G-TEST000001'),
    TEST_GA4_COOKIE_NAME
  )
  assert.equal(ga4CookieNameFromMeasurementId('G-VMDE8PW9W7'), '_ga_VMDE8PW9W7')
  assert.equal(ga4CookieNameFromMeasurementId(''), '')
})

function pageWithCookieConfig(config, added) {
  return {
    url: () => 'https://localhost:8015/manage-recycling-obligations/signed-out',
    evaluate: async () => ({
      cookiePath: '/manage-recycling-obligations',
      bannerMeasurementId: '',
      gtagSrc: '',
      ...config
    }),
    context: () => ({
      addCookies: async (cookies) => {
        added.push(...cookies)
      }
    })
  }
}

test('setTestGaCookies uses domain and path without url', async () => {
  const added = []
  const page = pageWithCookieConfig(
    { bannerMeasurementId: 'G-TEST000001' },
    added
  )

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

test('setTestGaCookies follows the environment measurement ID after the banner is gone', async () => {
  const added = []
  const page = pageWithCookieConfig({}, added)

  await setTestGaCookies(page, 'G-ELWVZY60SF')

  assert.deepEqual(
    added.map((cookie) => cookie.name),
    ['_ga', '_ga_ELWVZY60SF']
  )
})

test('setTestGaCookies reads the measurement ID from the loaded gtag script', async () => {
  const added = []
  const page = pageWithCookieConfig(
    { gtagSrc: 'https://www.googletagmanager.com/gtag/js?id=G-ELWVZY60SF' },
    added
  )

  await setTestGaCookies(page)

  assert.deepEqual(
    added.map((cookie) => cookie.name),
    ['_ga', '_ga_ELWVZY60SF']
  )
})

test('setTestGaCookies does not invent a CI measurement ID', async () => {
  const added = []
  const page = pageWithCookieConfig({}, added)

  await setTestGaCookies(page)

  assert.deepEqual(
    added.map((cookie) => cookie.name),
    ['_ga']
  )
})
