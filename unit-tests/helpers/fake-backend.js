import { createServer } from 'node:http'
import { request } from '@playwright/test'

const AUTH_ENV_KEYS = [
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

export function isAwaitingPrnList(url) {
  const parsed = new URL(url, 'http://127.0.0.1')

  return (
    parsed.pathname === '/organisations/org/prns' &&
    parsed.searchParams.get('status') === 'AwaitingAcceptance'
  )
}

function restoreEnv(original) {
  for (const key of AUTH_ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
}

// Starts a loopback API, points the Waste Obligations client at it, and
// restores the previous env when `close` runs.
export async function startFakeBackend(handler, { context } = {}) {
  const original = Object.fromEntries(
    AUTH_ENV_KEYS.map((key) => [key, process.env[key]])
  )
  const server = createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

  let api
  try {
    api = await request.newContext(context)
  } catch (error) {
    await new Promise((resolve) => server.close(resolve))
    throw error
  }

  const baseUrl = `http://127.0.0.1:${server.address().port}`
  for (const key of AUTH_ENV_KEYS) delete process.env[key]
  Object.assign(process.env, {
    WASTE_OBLIGATIONS_API_BASE_URL: baseUrl,
    WASTE_OBLIGATION_USERNAME: 'reader',
    WASTE_OBLIGATION_PASSWORD: 'reader-password',
    JOURNEY_USER: 'admin',
    JOURNEY_PASSWORD: 'admin-password',
    WASTE_OBLIGATION_SUBMITTER_ID: 'submitter',
    WASTE_OBLIGATION_SUBMITTER_EMAIL: 'submitter@example.com'
  })

  return {
    api,
    baseUrl,
    async close() {
      try {
        await api.dispose()
        await new Promise((resolve) => server.close(resolve))
      } finally {
        restoreEnv(original)
      }
    }
  }
}
