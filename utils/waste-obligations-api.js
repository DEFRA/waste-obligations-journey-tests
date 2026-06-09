import { requireEnv, requirePrefixedEnv } from './env.js'

export function getBackendBaseUrl() {
  const env = process.env.ENVIRONMENT === 'dev' ? 'dev' : 'tst'
  return `https://waste-obligations.${env}.cdp-int.defra.cloud`
}

export function getOrgId() {
  return requirePrefixedEnv('WASTE_OBLIGATION_ORG_ID')
}

export function getBasicAuthHeader() {
  const username = requirePrefixedEnv('WASTE_OBLIGATION_USERNAME')
  const password = requirePrefixedEnv('WASTE_OBLIGATION_PASSWORD')
  const token = Buffer.from(`${username}:${password}`).toString('base64')
  return `Basic ${token}`
}

export function getSubmitterUser() {
  return {
    id: requireEnv('WASTE_OBLIGATION_SUBMITTER_ID'),
    email: requireEnv('WASTE_OBLIGATION_SUBMITTER_EMAIL')
  }
}

function buildHeaders() {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: getBasicAuthHeader()
  }
}

export async function listDeclarations(request, orgId) {
  const response = await request.get(
    `${getBackendBaseUrl()}/organisations/${orgId}/compliance-declarations`,
    { headers: buildHeaders() }
  )
  if (!response.ok()) {
    throw new Error(
      `GET compliance-declarations failed: ${response.status()} ${await response.text()}`
    )
  }
  const body = await response.json()
  return Array.isArray(body) ? body : (body.items ?? [])
}

export async function cancelDeclaration(request, orgId, declarationId) {
  const response = await request.patch(
    `${getBackendBaseUrl()}/organisations/${orgId}/compliance-declarations/${declarationId}`,
    {
      headers: buildHeaders(),
      data: { status: 'CANCELLED', user: getSubmitterUser() }
    }
  )
  if (!response.ok()) {
    throw new Error(
      `PATCH compliance-declaration ${declarationId} failed: ${response.status()} ${await response.text()}`
    )
  }
}

export async function cancelAllOpenDeclarations(request, orgId) {
  const declarations = await listDeclarations(request, orgId)
  const open = declarations.filter(
    (declaration) => declaration?.status !== 'CANCELLED'
  )
  for (const declaration of open) {
    await cancelDeclaration(request, orgId, declaration.id)
  }
  return open.length
}
