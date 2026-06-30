import { DECLARATION_STATUS } from '../data/csoc.data.js'
import { requireEnv } from './env.js'

export function getBackendBaseUrl() {
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

export async function listDeclarations(request, orgId, obligationYear) {
  const response = await request.get(
    `${getBackendBaseUrl()}/organisations/${orgId}/compliance-declarations?obligationYear=${obligationYear}`,
    { headers: buildHeaders(getBasicAuthHeader()) }
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
    { headers: buildHeaders(getBasicAuthHeader()), data }
  )
  if (!response.ok()) {
    throw new Error(
      `PATCH compliance-declaration ${declarationId} to ${status} failed: ${response.status()} ${await response.text()}`
    )
  }
}

// DELETE lives on a tenant-agnostic admin route (no /organisations/{orgId} scope)
// and is gated on a separate JOURNEY_USER principal, not the submitter credentials.
export async function deleteDeclaration(request, declarationId) {
  const response = await request.delete(
    `${getBackendBaseUrl()}/compliance-declarations/${declarationId}`,
    { headers: buildHeaders(getJourneyAuthHeader()) }
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
