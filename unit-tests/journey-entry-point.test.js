import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  describeCsocActionHref,
  getProducerPrnsUrl,
  getPublicFrontendUrl,
  getPublicServicePath,
  getWasteObligationsFrontendBaseUrl
} from '../utils/journey-entry-point.js'

test('PRNs resolves its own destination without a certificate URL', () => {
  const keys = [
    'JOURNEY_ENTRY_POINT',
    'EPR_BASE_URL',
    'WASTE_OBLIGATIONS_FRONTEND_BASE_URL',
    'WASTE_OBLIGATION_ORG_ID'
  ]
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]])
  )
  process.env.WASTE_OBLIGATION_ORG_ID = 'producer-id'
  try {
    for (const prefix of ['', '/manage-recycling-obligations']) {
      for (const trailingSlash of ['', '/']) {
        process.env.JOURNEY_ENTRY_POINT = 'waste-obligations'
        process.env.EPR_BASE_URL = `https://proxy.example${prefix}${trailingSlash}`
        process.env.WASTE_OBLIGATIONS_FRONTEND_BASE_URL =
          'https://ignored.example'
        assert.equal(
          getProducerPrnsUrl(2026).href,
          `https://proxy.example${prefix}/producer/producer-id/prns?year=2026`
        )
        process.env.JOURNEY_ENTRY_POINT = 'packaging'
        process.env.EPR_BASE_URL = 'https://azure.example/report-data'
        process.env.WASTE_OBLIGATIONS_FRONTEND_BASE_URL = `https://deployed-proxy.example${prefix}${trailingSlash}?old=1#old`
        assert.equal(
          getProducerPrnsUrl(2025).href,
          `https://deployed-proxy.example${prefix}/producer/producer-id/prns?year=2025`
        )
      }
    }
    delete process.env.WASTE_OBLIGATIONS_FRONTEND_BASE_URL
    assert.throws(
      () => getProducerPrnsUrl(2026),
      /WASTE_OBLIGATIONS_FRONTEND_BASE_URL/
    )
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
  }
})

test('public service paths keep the proxy prefix for CDP entry', () => {
  const keys = ['JOURNEY_ENTRY_POINT', 'EPR_BASE_URL']
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]])
  )

  try {
    process.env.JOURNEY_ENTRY_POINT = 'waste-obligations'
    process.env.EPR_BASE_URL =
      'https://localhost:8015/manage-recycling-obligations/'
    assert.equal(
      getPublicServicePath('/signed-out'),
      '/manage-recycling-obligations/signed-out'
    )
    assert.equal(
      getPublicServicePath('cookies'),
      '/manage-recycling-obligations/cookies'
    )

    process.env.JOURNEY_ENTRY_POINT = 'packaging'
    process.env.EPR_BASE_URL = 'https://localhost:7084/report-data'
    assert.equal(getPublicServicePath('/signed-out'), '/signed-out')
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
  }
})

test('public frontend URLs use the CDP frontend in Packaging mode', () => {
  const keys = [
    'JOURNEY_ENTRY_POINT',
    'EPR_BASE_URL',
    'WASTE_OBLIGATIONS_FRONTEND_BASE_URL'
  ]
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]])
  )

  try {
    process.env.JOURNEY_ENTRY_POINT = 'waste-obligations'
    process.env.EPR_BASE_URL =
      'https://localhost:8015/manage-recycling-obligations/'
    process.env.WASTE_OBLIGATIONS_FRONTEND_BASE_URL = 'https://ignored.example'
    assert.equal(
      getPublicFrontendUrl('/signed-out'),
      'https://localhost:8015/manage-recycling-obligations/signed-out'
    )
    assert.equal(
      getPublicFrontendUrl('/cookies', 'lang=cy'),
      'https://localhost:8015/manage-recycling-obligations/cookies?lang=cy'
    )
    assert.equal(
      getWasteObligationsFrontendBaseUrl(),
      'https://localhost:8015/manage-recycling-obligations/'
    )

    process.env.JOURNEY_ENTRY_POINT = 'packaging'
    process.env.EPR_BASE_URL = 'https://azure.example/report-data'
    process.env.WASTE_OBLIGATIONS_FRONTEND_BASE_URL =
      'https://deployed-proxy.example/manage-recycling-obligations/?old=1#old'
    assert.equal(
      getPublicFrontendUrl('/signed-out'),
      'https://deployed-proxy.example/manage-recycling-obligations/signed-out'
    )
    assert.equal(
      getPublicFrontendUrl('cookies'),
      'https://deployed-proxy.example/manage-recycling-obligations/cookies'
    )
    assert.equal(
      getWasteObligationsFrontendBaseUrl(),
      'https://deployed-proxy.example/manage-recycling-obligations/'
    )

    delete process.env.WASTE_OBLIGATIONS_FRONTEND_BASE_URL
    assert.throws(
      () => getPublicFrontendUrl('/signed-out'),
      /WASTE_OBLIGATIONS_FRONTEND_BASE_URL/
    )
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
  }
})

test('CSOC Azure actions must use the public CDP frontend', () => {
  const keys = ['JOURNEY_ENTRY_POINT', 'WASTE_OBLIGATIONS_FRONTEND_BASE_URL']
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]])
  )

  try {
    process.env.JOURNEY_ENTRY_POINT = 'packaging'
    process.env.WASTE_OBLIGATIONS_FRONTEND_BASE_URL =
      'https://packaging-waste-proxy.dev.cdp-int.defra.cloud/manage-recycling-obligations/'

    assert.equal(
      describeCsocActionHref(
        'https://packaging-waste-proxy.dev.cdp-int.defra.cloud/manage-recycling-obligations/producer/org/compliance/certificate?year=2026'
      ),
      null
    )
    assert.match(
      describeCsocActionHref(
        'https://waste-obligations-frontend.dev.cdp-int.defra.cloud/producer/org/compliance/certificate?year=2026'
      ),
      /does not match the public CDP frontend/
    )
    assert.match(
      describeCsocActionHref(
        'https://packaging-waste-proxy.dev.cdp-int.defra.cloud/producer/org/compliance/certificate?year=2026'
      ),
      /proxy prefix/
    )
    assert.match(
      describeCsocActionHref('/report-data/manage-your-recycling-obligations'),
      /not a CDP certificate or statement URL/
    )

    process.env.JOURNEY_ENTRY_POINT = 'waste-obligations'
    assert.equal(
      describeCsocActionHref(
        'https://localhost:8015/manage-recycling-obligations/producer/org/compliance/certificate?year=2026'
      ),
      null
    )
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
  }
})
