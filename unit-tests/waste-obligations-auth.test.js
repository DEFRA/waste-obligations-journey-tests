import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { request } from '@playwright/test'
import {
  listDeclarations,
  listAwaitingPrns,
  setDeclarationStatus,
  deleteDeclaration
} from '../utils/waste-obligations-api.js'

function isAwaitingPrnList(url) {
  const parsed = new URL(url, 'http://127.0.0.1')

  return (
    parsed.pathname === '/organisations/org/prns' &&
    parsed.searchParams.get('status') === 'AwaitingAcceptance'
  )
}

test('backend authentication over HTTP', async (t) => {
  const keys = [
    'WASTE_OBLIGATIONS_API_BASE_URL',
    'WASTE_OBLIGATIONS_API_TOKEN_URL',
    'WASTE_OBLIGATIONS_API_CLIENT_ID',
    'WASTE_OBLIGATIONS_API_CLIENT_SECRET',
    'WASTE_OBLIGATION_USERNAME',
    'WASTE_OBLIGATION_PASSWORD',
    'JOURNEY_USER',
    'JOURNEY_PASSWORD',
    'WASTE_OBLIGATION_SUBMITTER_ID',
    'WASTE_OBLIGATION_SUBMITTER_EMAIL'
  ]
  const original = keys.map((key) => process.env[key])
  const calls = []
  let prnStatus = 200
  let prnBody = { prns: [{ number: 'PRN123' }] }
  let tokenStatus = 200
  let rawTokenBody
  let tokenBody = { access_token: 'test-token' }
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    calls.push({ method: req.method, url: req.url, headers: req.headers, body })
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/token') {
      res.statusCode = tokenStatus
      res.end(rawTokenBody ?? JSON.stringify(tokenBody))
    } else if (isAwaitingPrnList(req.url)) {
      res.statusCode = prnStatus
      res.end(JSON.stringify(prnBody))
    } else {
      res.end(JSON.stringify({ complianceDeclarations: [] }))
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const api = await request.newContext({
    extraHTTPHeaders: { 'X-Test-Context': 'journey-context' }
  })
  t.after(async () => {
    await api.dispose()
    await new Promise((resolve) => server.close(resolve))
    keys.forEach((key, i) => {
      if (original[i] === undefined) delete process.env[key]
      else process.env[key] = original[i]
    })
  })
  keys.forEach((key) => delete process.env[key])
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  Object.assign(process.env, {
    WASTE_OBLIGATIONS_API_BASE_URL: baseUrl,
    WASTE_OBLIGATION_USERNAME: 'reader',
    WASTE_OBLIGATION_PASSWORD: 'reader-password',
    JOURNEY_USER: 'admin',
    JOURNEY_PASSWORD: 'admin-password',
    WASTE_OBLIGATION_SUBMITTER_ID: 'submitter',
    WASTE_OBLIGATION_SUBMITTER_EMAIL: 'submitter@example.com'
  })
  const exercise = async () => {
    assert.deepEqual(await listAwaitingPrns(api, 'org'), [{ number: 'PRN123' }])
    await listDeclarations(api, 'org', 2026)
    await setDeclarationStatus(api, 'org', 'declaration', 'Accepted')
    await deleteDeclaration(api, 'declaration')
  }

  await t.test(
    'default Basic auth retains separate cleanup credentials',
    async () => {
      await exercise()
      assert.deepEqual(
        calls.map((call) => call.headers.authorization),
        [
          'reader:reader-password',
          'reader:reader-password',
          'reader:reader-password',
          'admin:admin-password'
        ].map((value) => `Basic ${Buffer.from(value).toString('base64')}`)
      )
    }
  )

  await t.test('PRN read rejects failed or malformed responses', async () => {
    const validBody = prnBody
    try {
      prnStatus = 500
      await assert.rejects(
        listAwaitingPrns(api, 'org'),
        /GET organisation PRNs \(status=AwaitingAcceptance\) failed: 500 \{"prns"/
      )
      prnStatus = 200
      prnBody = { items: [] }
      await assert.rejects(
        listAwaitingPrns(api, 'org'),
        /\(status=AwaitingAcceptance\) returned unexpected shape: \{"items":\[\]\}/
      )
      prnBody = { prns: [] }
      assert.deepEqual(await listAwaitingPrns(api, 'org'), [])
    } finally {
      prnStatus = 200
      prnBody = validBody
    }
  })

  await t.test(
    'OAuth uses form encoding and Bearer for every API operation without Basic credentials',
    async () => {
      calls.length = 0
      Object.assign(process.env, {
        WASTE_OBLIGATIONS_API_TOKEN_URL: `${baseUrl}/token`,
        WASTE_OBLIGATIONS_API_CLIENT_ID: 'client',
        WASTE_OBLIGATIONS_API_CLIENT_SECRET: 'secret+&='
      })
      for (const key of [
        'WASTE_OBLIGATION_USERNAME',
        'WASTE_OBLIGATION_PASSWORD',
        'JOURNEY_USER',
        'JOURNEY_PASSWORD'
      ]) {
        delete process.env[key]
      }
      await exercise()
      const tokens = calls.filter((call) => call.url === '/token')
      assert.equal(tokens.length, 4)
      for (const call of tokens) {
        assert.equal(call.method, 'POST')
        assert.equal(call.headers['x-test-context'], undefined)
        assert.match(
          call.headers['content-type'],
          /application\/x-www-form-urlencoded/
        )
        assert.deepEqual(Object.fromEntries(new URLSearchParams(call.body)), {
          grant_type: 'client_credentials',
          client_id: 'client',
          client_secret: 'secret+&='
        })
      }
      const operations = calls.filter((call) => call.url !== '/token')
      assert.deepEqual(
        operations.map((call) => call.method),
        ['GET', 'GET', 'PATCH', 'DELETE']
      )
      for (const call of operations)
        assert.equal(call.headers.authorization, 'Bearer test-token')
    }
  )

  await t.test(
    'partial configuration fails before making a request',
    async () => {
      calls.length = 0
      delete process.env.WASTE_OBLIGATIONS_API_CLIENT_SECRET
      await assert.rejects(
        listDeclarations(api, 'org', 2026),
        /WASTE_OBLIGATIONS_API_CLIENT_SECRET must be set/
      )
      assert.equal(calls.length, 0)
      process.env.WASTE_OBLIGATIONS_API_CLIENT_SECRET = 'secret'
    }
  )

  await t.test(
    'invalid JSON does not leak the token response into errors',
    async () => {
      calls.length = 0
      rawTokenBody = 'sensitive-invalid-json'
      await assert.rejects(
        listDeclarations(api, 'org', 2026),
        /^Error: Waste Obligations token response is not valid JSON$/
      )
      assert.equal(calls.length, 1)
      rawTokenBody = undefined
    }
  )

  await t.test(
    'failed or malformed token responses prevent API calls',
    async () => {
      for (const [status, body, message] of [
        [401, { error: 'sensitive details' }, /token request failed: 401$/],
        [200, {}, /missing access_token/],
        [200, null, /missing access_token/]
      ]) {
        calls.length = 0
        tokenStatus = status
        tokenBody = body
        await assert.rejects(deleteDeclaration(api, 'declaration'), message)
        assert.deepEqual(
          calls.map((call) => call.url),
          ['/token']
        )
      }
    }
  )
})

test('awaiting PRNs follow the reported page size and keep a repeated note once', async () => {
  const keys = [
    'WASTE_OBLIGATIONS_API_BASE_URL',
    'WASTE_OBLIGATION_USERNAME',
    'WASTE_OBLIGATION_PASSWORD'
  ]
  const original = keys.map((key) => process.env[key])
  const calls = []
  const pages = {
    1: {
      prns: [
        { id: 'a', number: 'PRN001' },
        { id: 'b', number: 'PRN002' }
      ],
      total: 5,
      pageSize: 2
    },
    2: {
      prns: [
        { id: 'a', number: 'PRN001' },
        { id: 'c', number: 'PRN003' }
      ],
      total: 2,
      pageSize: 20
    },
    3: {
      prns: [{ id: 'd', number: 'PRN004' }],
      total: 4,
      pageSize: 2
    }
  }
  const server = createServer((req, res) => {
    calls.push(req.url)
    const page = Number(
      new URL(req.url, 'http://127.0.0.1').searchParams.get('page')
    )
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(pages[page]))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const api = await request.newContext()
  try {
    Object.assign(process.env, {
      WASTE_OBLIGATIONS_API_BASE_URL: `http://127.0.0.1:${server.address().port}`,
      WASTE_OBLIGATION_USERNAME: 'reader',
      WASTE_OBLIGATION_PASSWORD: 'reader-password'
    })

    const prns = await listAwaitingPrns(api, 'org')

    assert.deepEqual(
      prns.map((prn) => prn.number),
      ['PRN001', 'PRN002', 'PRN003', 'PRN004']
    )
    assert.deepEqual(calls, [
      '/organisations/org/prns?status=AwaitingAcceptance&page=1&pageSize=100',
      '/organisations/org/prns?status=AwaitingAcceptance&page=2&pageSize=2',
      '/organisations/org/prns?status=AwaitingAcceptance&page=3&pageSize=2'
    ])
  } finally {
    await api.dispose()
    await new Promise((resolve) => server.close(resolve))
    keys.forEach((key, index) => {
      if (original[index] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = original[index]
      }
    })
  }
})
