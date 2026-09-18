import { DECLARATION_STATUS } from '../data/csoc.data.js'
import { requireEnv } from './env.js'

export function getBackendBaseUrl() {
  if (process.env.WASTE_OBLIGATIONS_API_BASE_URL) {
    return process.env.WASTE_OBLIGATIONS_API_BASE_URL
  }
  if (process.env.ENVIRONMENT === 'local') {
    return 'http://localhost:8007'
  }
  const env = process.env.ENVIRONMENT === 'dev' ? 'dev' : 'tst'
  return `https://waste-obligations.${env}.cdp-int.defra.cloud`
}

export function getOrgId(account = 'dp') {
  return requireEnv(
    account === 'cso'
      ? 'WASTE_OBLIGATION_CSO_ORG_ID'
      : 'WASTE_OBLIGATION_ORG_ID'
  )
}

function basicAuthHeader(username, password) {
  const token = Buffer.from(`${username}:${password}`).toString('base64')
  return `Basic ${token}`
}

export function getBasicAuthHeader() {
  return basicAuthHeader(
    requireEnv('WASTE_OBLIGATION_USERNAME'),
    requireEnv('WASTE_OBLIGATION_PASSWORD')
  )
}

export function getJourneyAuthHeader() {
  return basicAuthHeader(
    requireEnv('JOURNEY_USER'),
    requireEnv('JOURNEY_PASSWORD')
  )
}

async function getAuthHeader(journeyAdmin = false) {
  const names = [
    'WASTE_OBLIGATIONS_API_TOKEN_URL',
    'WASTE_OBLIGATIONS_API_CLIENT_ID',
    'WASTE_OBLIGATIONS_API_CLIENT_SECRET'
  ]
  if (!names.some((name) => process.env[name])) {
    return journeyAdmin ? getJourneyAuthHeader() : getBasicAuthHeader()
  }

  // Partial OAuth configuration must fail rather than silently use Basic auth.
  const [tokenUrl, clientId, clientSecret] = names.map(requireEnv)
  // Playwright traces even standalone API contexts. Use an untraced token
  // exchange so client credentials and token responses are not saved in reports.
  let response
  try {
    response = await fetch(tokenUrl, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      }),
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(30_000)
    })
  } catch {
    throw new Error('Waste Obligations token request failed')
  }
  if (!response.ok) {
    // Token endpoint bodies can contain credentials; report only the status.
    throw new Error(
      `Waste Obligations token request failed: ${response.status}`
    )
  }
  let body
  try {
    body = await response.json()
  } catch {
    throw new Error('Waste Obligations token response is not valid JSON')
  }
  if (typeof body?.access_token !== 'string' || !body.access_token.trim()) {
    throw new Error('Waste Obligations token response is missing access_token')
  }
  return `Bearer ${body.access_token}`
}

export function getSubmitterUser() {
  return {
    name: 'Journey-test submitter',
    id: requireEnv('WASTE_OBLIGATION_SUBMITTER_ID'),
    email: requireEnv('WASTE_OBLIGATION_SUBMITTER_EMAIL')
  }
}

function buildHeaders(authHeader) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: authHeader
  }
}

// Match the browser list's default first-page AwaitingAcceptance query.
export async function listAwaitingPrns(request, orgId) {
  const response = await request.get(
    `${getBackendBaseUrl()}/organisations/${orgId}/prns?status=AwaitingAcceptance`,
    { headers: buildHeaders(await getAuthHeader()) }
  )
  if (!response.ok()) {
    throw new Error(`GET organisation PRNs failed: ${response.status()}`)
  }
  const body = await response.json()
  if (!Array.isArray(body.prns)) {
    throw new Error(
      'GET organisation PRNs returned an unexpected response shape'
    )
  }
  return body.prns
}

export async function listDeclarations(request, orgId, obligationYear) {
  const response = await request.get(
    `${getBackendBaseUrl()}/organisations/${orgId}/compliance-declarations?obligationYear=${obligationYear}`,
    { headers: buildHeaders(await getAuthHeader()) }
  )
  if (!response.ok()) {
    throw new Error(
      `GET compliance-declarations failed: ${response.status()} ${await response.text()}`
    )
  }
  const body = await response.json()
  if (!Array.isArray(body.complianceDeclarations)) {
    throw new Error(
      `GET compliance-declarations returned unexpected shape: ${JSON.stringify(body).slice(0, 500)}`
    )
  }
  return body.complianceDeclarations
}

export async function setDeclarationStatus(
  request,
  orgId,
  declarationId,
  status,
  reason,
  account = 'dp'
) {
  if (reason !== undefined && status !== DECLARATION_STATUS.Cancelled) {
    throw new Error(
      `reason is only valid when cancelling a declaration; got status=${status}`
    )
  }
  const data = { status, user: getSubmitterUser() }
  if (status === DECLARATION_STATUS.Cancelled) {
    data.reason = reason ?? 'Journey-test status change'
  }
  const response = await request.patch(
    `${getBackendBaseUrl()}/organisations/${orgId}/compliance-declarations/${declarationId}`,
    { headers: buildHeaders(await getAuthHeader()), data }
  )
  if (!response.ok()) {
    throw new Error(
      `PATCH compliance-declaration ${declarationId} to ${status} failed: ${response.status()} ${await response.text()}`
    )
  }
}

// DELETE lives on a tenant-agnostic admin route (no /organisations/{orgId} scope)
// Basic auth uses the separate JOURNEY_USER principal; gateway OAuth uses the
// configured client, which must also have permission to delete declarations.
export async function deleteDeclaration(request, declarationId) {
  const response = await request.delete(
    `${getBackendBaseUrl()}/compliance-declarations/${declarationId}`,
    { headers: buildHeaders(await getAuthHeader(true)) }
  )
  if (!response.ok()) {
    throw new Error(
      `DELETE compliance-declaration ${declarationId} failed: ${response.status()} ${await response.text()}`
    )
  }
}

export async function deleteAllDeclarations(request, orgId, obligationYear) {
  const declarations = await listDeclarations(request, orgId, obligationYear)
  const failures = []
  for (const declaration of declarations) {
    try {
      await deleteDeclaration(request, declaration.id)
    } catch (error) {
      failures.push({ id: declaration.id, error })
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((f) => f.error),
      `Failed to delete ${failures.length}/${declarations.length} declaration(s): ${failures.map((f) => f.id).join(', ')}`
    )
  }
  return declarations.length
}
