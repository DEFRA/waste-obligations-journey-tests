import { DECLARATION_STATUS } from '../data/csoc.data.js'
import { requireEnv } from './env.js'

export function getBackendBaseUrl() {
  if (process.env.WASTE_OBLIGATIONS_API_BASE_URL) {
    return process.env.WASTE_OBLIGATIONS_API_BASE_URL
  }
  if (process.env.ENVIRONMENT === 'local') {
    return 'http://localhost:8007'
  }
  // CDP names its environment "test"; "tst" is the Azure name (rwd-tst1).
  const env = process.env.ENVIRONMENT === 'dev' ? 'dev' : 'test'
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

// Every awaiting-acceptance note, not the first page only. The browser list
// filters this same set by year.
export async function listAwaitingPrns(request, orgId) {
  return listPrns(request, orgId, 'AwaitingAcceptance')
}

// The browser lists only awaiting PRNs, so accepted ones are found here.
export async function listAcceptedPrns(request, orgId) {
  return listPrns(request, orgId, 'Accepted')
}

// Rejected notes are not on the browser's awaiting list either.
export async function listRejectedPrns(request, orgId) {
  return listPrns(request, orgId, 'Rejected')
}

const FETCH_PAGE_SIZE = 100

function reportedPageSize(body) {
  return Number.isInteger(body.pageSize) && body.pageSize > 0
    ? body.pageSize
    : null
}

// The API offsets a page by (page - 1) * the page size of that request.
// Trust a smaller size only when the first page is full at that size.
function pageSizeFromFirstResponse(body, requested) {
  const reported = reportedPageSize(body)
  const count = body.items.length

  if (reported != null && reported < requested && count === reported) {
    return reported
  }

  return requested
}

function appendUnseen(items, seenIds, pageItems) {
  for (const item of pageItems) {
    if (item?.id != null && seenIds.has(item.id)) {
      continue
    }
    if (item?.id != null) {
      seenIds.add(item.id)
    }
    items.push(item)
  }
}

// One page at a time. The page count and page size stay on the first response,
// and a repeated item is kept once, so a later page cannot end the walk or
// shift the next offset. `readPage` returns `{ items, total, pageSize }`.
async function readAllPages(readPage) {
  const first = await readPage(1, FETCH_PAGE_SIZE)
  const pageSize = pageSizeFromFirstResponse(first, FETCH_PAGE_SIZE)
  const total = Number.isInteger(first.total) ? first.total : first.items.length
  const pageCount = pageSize > 0 ? Math.ceil(total / pageSize) : 1
  const items = []
  const seenIds = new Set()

  appendUnseen(items, seenIds, first.items)

  for (let page = 2; page <= pageCount; page += 1) {
    const body = await readPage(page, pageSize)
    appendUnseen(items, seenIds, body.items)
  }

  return items
}

async function readJsonPage(request, path, itemsKey, query, description) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    params.set(key, String(value))
  }
  const response = await request.get(
    `${getBackendBaseUrl()}${path}?${params}`,
    {
      headers: buildHeaders(await getAuthHeader())
    }
  )
  if (!response.ok()) {
    throw new Error(
      `${description} failed: ${response.status()} ${await response.text()}`
    )
  }
  const body = await response.json()
  if (!Array.isArray(body[itemsKey])) {
    throw new Error(
      `${description} returned unexpected shape: ${JSON.stringify(body).slice(0, 500)}`
    )
  }

  return {
    items: body[itemsKey],
    total: body.total,
    pageSize: body.pageSize
  }
}

async function listAll(request, path, itemsKey, query, description) {
  return readAllPages((page, pageSize) =>
    readJsonPage(
      request,
      path,
      itemsKey,
      { ...query, page, pageSize },
      description
    )
  )
}

async function listPrns(request, orgId, status) {
  return listAll(
    request,
    `/organisations/${orgId}/prns`,
    'prns',
    { status },
    `GET organisation PRNs (status=${status})`
  )
}

export async function readObligations(request, orgId, obligationYear) {
  const response = await request.get(
    `${getBackendBaseUrl()}/organisations/${orgId}/obligations?obligationYear=${obligationYear}`,
    { headers: buildHeaders(await getAuthHeader()) }
  )
  if (!response.ok()) {
    throw new Error(`GET organisation obligations failed: ${response.status()}`)
  }
  const body = await response.json()
  if (!Array.isArray(body.obligations)) {
    throw new Error(
      'GET organisation obligations returned an unexpected response shape'
    )
  }
  return body.obligations
}

export async function listDeclarations(request, orgId, obligationYear) {
  return listAll(
    request,
    `/organisations/${orgId}/compliance-declarations`,
    'complianceDeclarations',
    { obligationYear },
    'GET compliance-declarations'
  )
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
