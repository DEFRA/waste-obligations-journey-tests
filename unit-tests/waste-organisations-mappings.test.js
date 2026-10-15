import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createMappings } from '../ci/generate-waste-organisations-mappings.mjs'

const env = {
  WASTE_OBLIGATION_ORG_ID: '11111111-1111-1111-1111-111111111111',
  WASTE_OBLIGATION_CSO_ORG_ID: '22222222-2222-2222-2222-222222222222'
}

test('fixtures preserve DP and CSO identities and registration types', () => {
  const mappings = createMappings(env, 2027)
  const dp = mappings['waste-organisations-dp.json'].Response.BodyAsJson
  const cso = mappings['waste-organisations-cso.json'].Response.BodyAsJson
  assert.equal(dp.id, env.WASTE_OBLIGATION_ORG_ID)
  assert.equal(dp.name, 'POP QUEST LTD')
  assert.equal(dp.tradingName, '')
  assert.equal(cso.id, env.WASTE_OBLIGATION_CSO_ORG_ID)
  assert.equal(cso.name, 'Organisation Name')
  assert.equal(cso.tradingName, 'Compliance Scheme Name')
  for (const [organisation, type] of [
    [dp, 'LARGE_PRODUCER'],
    [cso, 'COMPLIANCE_SCHEME']
  ]) {
    assert.deepEqual(organisation.registrations, [
      {
        type,
        status: 'REGISTERED',
        registrationYear: 2027,
        created: '2027-01-01T00:00:00+00:00',
        updated: '2027-01-01T00:00:00+00:00'
      }
    ])
    assert.equal(organisation.address.postcode, null)
    assert.equal(organisation.businessCountry, null)
  }
  assert.deepEqual(
    mappings['waste-organisations-list.json'].Response.BodyAsJson,
    { organisations: [dp, cso] }
  )
})

test('invalid or colliding IDs fail before publishing misleading mappings', () => {
  assert.throws(
    () => createMappings({}),
    /WASTE_OBLIGATION_ORG_ID must be a GUID/
  )
  assert.throws(
    () => createMappings({ ...env, WASTE_OBLIGATION_CSO_ORG_ID: 'not-a-guid' }),
    /WASTE_OBLIGATION_CSO_ORG_ID must be a GUID/
  )
  assert.throws(
    () =>
      createMappings({
        ...env,
        WASTE_OBLIGATION_CSO_ORG_ID: env.WASTE_OBLIGATION_ORG_ID
      }),
    /must be different/
  )
})

test('CLI writes all mappings beside other service-owned contracts', async () => {
  const output = await mkdtemp(join(tmpdir(), 'organisation-mappings-'))
  try {
    execFileSync(
      process.execPath,
      ['ci/generate-waste-organisations-mappings.mjs'],
      {
        env: {
          ...process.env,
          ...env,
          JOURNEY_TEST_WIREMOCK_MAPPINGS_DIR: output
        }
      }
    )
    assert.equal((await readdir(output)).length, 7)
    const dp = JSON.parse(
      await readFile(join(output, 'waste-organisations-dp.json'), 'utf8')
    )
    assert.equal(
      dp.Request.Path.Matchers[0].Pattern,
      `/organisations/${env.WASTE_OBLIGATION_ORG_ID}`
    )
    assert.equal(
      dp.Response.BodyAsJson.registrations[0].registrationYear,
      new Date().getFullYear()
    )
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})
