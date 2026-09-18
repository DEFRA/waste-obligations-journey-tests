import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getProducerPrnsUrl } from '../utils/journey-entry-point.js'

test('PRN navigation keeps the certificate host and prefix after either entry point', () => {
  const original = process.env.WASTE_OBLIGATION_ORG_ID
  process.env.WASTE_OBLIGATION_ORG_ID = 'producer-id'
  try {
    for (const prefix of ['', '/manage-recycling-obligations']) {
      for (const trailingSlash of ['', '/', '/0123456789abcdef01234567']) {
        const url = getProducerPrnsUrl(
          2026,
          `https://frontend.example${prefix}/producer/producer-id/compliance/certificate${trailingSlash}?year=2025#old`
        )
        assert.equal(
          url.href,
          `https://frontend.example${prefix}/producer/producer-id/prns?year=2026`
        )
      }
    }
    assert.throws(
      () => getProducerPrnsUrl(2026, 'https://azure.example/report-data/home'),
      /Expected the producer certificate page/
    )
    assert.throws(
      () =>
        getProducerPrnsUrl(
          2026,
          'https://frontend.example/producer/other/compliance/certificate'
        ),
      /Expected the producer certificate page/
    )
  } finally {
    if (original === undefined) delete process.env.WASTE_OBLIGATION_ORG_ID
    else process.env.WASTE_OBLIGATION_ORG_ID = original
  }
})
