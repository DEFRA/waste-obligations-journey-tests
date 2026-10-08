import { randomUUID } from 'node:crypto'
import {
  getBackendBaseUrl,
  getBasicAuthHeader,
  listDeclarations,
  setDeclarationStatus
} from './waste-obligations-api.js'
import { REGULATOR_BY_COUNTRY } from '../data/unsubmitted-orgs-test-data.js'
import { DECLARATION_STATUS } from '../data/csoc.data.js'

// GUID matcher (RFC 4122). The backend rejects non-GUID user.id values
// with a 400. The submitter-user helper reads from env and defaults to
// "replace-me" placeholders — this check falls back to a fresh random
// GUID whenever the env value isn't a valid GUID.
const GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function submitterForCreate() {
  const rawId = process.env.WASTE_OBLIGATION_SUBMITTER_ID
  const rawEmail = process.env.WASTE_OBLIGATION_SUBMITTER_EMAIL
  return {
    name: 'Lifecycle-test submitter',
    id: rawId && GUID_RE.test(rawId) ? rawId : randomUUID(),
    email:
      rawEmail && rawEmail.includes('@')
        ? rawEmail
        : 'lifecycle-test@example.com',
    locale: 'en'
  }
}

// Values accepted by the /compliance-declarations/unsubmitted endpoint —
// centralised so specs can iterate over them without magic-string drift.
export const REGISTRATION_TYPE = Object.freeze({
  DirectProducer: 'DirectProducer',
  ComplianceScheme: 'ComplianceScheme'
})

export const COUNTRY = Object.freeze({
  England: 'GB-ENG',
  NorthernIreland: 'GB-NIR',
  Scotland: 'GB-SCT',
  Wales: 'GB-WLS'
})

export const SORT_FIELD = Object.freeze({
  Name: 'Name',
  ReferenceNumber: 'ReferenceNumber',
  RecyclingObligationsMet: 'RecyclingObligationsMet',
  ObligationCoveragePercentage: 'ObligationCoveragePercentage'
})

// AC2's required per-org fields. The ticket lists "Country" but the backend
// emits it as `businessCountry` — same data, different name. The spec
// asserts against the actual field name so the run stays green; the AC2
// transcript flags the naming nit so BA/dev can pick either "rename the
// field" or "update the AC wording".
export const REQUIRED_ORG_FIELDS = Object.freeze([
  'organisationId',
  'obligationYear',
  'registrationType',
  'name',
  'referenceNumber',
  'recyclingObligationsMet',
  'obligationCoveragePercentage',
  'businessCountry'
])

// Builds a URL query string from a params object. Arrays are joined with
// commas (the endpoint accepts CSVs for registrationType and sort). Nulls /
// undefineds are skipped so callers can pass a sparse object.
function buildQuery(params) {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ''
  )
  if (entries.length === 0) return ''
  const qs = entries
    .map(([k, v]) => {
      const value = Array.isArray(v) ? v.join(',') : String(v)
      return `${encodeURIComponent(k)}=${encodeURIComponent(value)}`
    })
    .join('&')
  return `?${qs}`
}

function unsubmittedUrl(params) {
  // In shared envs (tst/dev) the endpoint sits behind the CDP protected
  // gateway at .../waste-obligations/compliance-declarations/unsubmitted.
  // On local (direct to the service) there's no `/waste-obligations` prefix.
  // Point WASTE_OBLIGATIONS_BACKEND_URL at whichever base is appropriate —
  // the URL is assembled as `${base}/compliance-declarations/unsubmitted`
  // and the base is expected to include the service-path prefix if needed.
  return `${getBackendBaseUrl()}/compliance-declarations/unsubmitted${buildQuery(params)}`
}

// Shared auth headers for every backend call. Adds x-api-key when set (the
// CDP protected gateway needs it; localhost doesn't).
function authHeaders() {
  const headers = { Authorization: getBasicAuthHeader() }
  if (process.env.WASTE_OBLIGATIONS_API_KEY) {
    headers['x-api-key'] = process.env.WASTE_OBLIGATIONS_API_KEY
  }
  return headers
}

// POST /organisations/{orgId}/compliance-declarations — creates a new
// declaration. The endpoint validates the payload, so the shape has to be
// complete: organisation identity + regulator, obligation year, obligation
// status, submitter, user. Returns the created declaration's ID (or throws
// if the response isn't 201).
export async function createDeclaration(
  request,
  org,
  {
    obligationStatus = 'Met',
    isRegulation43Compliant = true,
    year = new Date().getFullYear()
  } = {}
) {
  const regulator = REGULATOR_BY_COUNTRY[org.country]
  if (!regulator) {
    throw new Error(`No regulator mapping for country ${org.country}`)
  }
  const user = submitterForCreate()
  const url = `${getBackendBaseUrl()}/organisations/${org.organisationId}/compliance-declarations`
  const payload = {
    organisation: {
      id: org.organisationId,
      registrationType: org.registrationType,
      name: org.name,
      referenceNumber: org.referenceNumber,
      businessCountry: org.country,
      regulator: regulator.name,
      regulatorEmail: regulator.email
    },
    obligationYear: year,
    obligations: [],
    obligationStatus,
    submitterName: user.name,
    user,
    isRegulation43Compliant
  }
  const response = await request.post(url, {
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    data: payload
  })
  if (response.status() !== 201) {
    throw new Error(
      `POST create-declaration failed for ${org.referenceNumber}: ${response.status()} ${await response.text()}`
    )
  }
  const body = await response.json()
  return { id: body.id ?? body.Id, response, body, requestPayload: payload }
}

// Cancels every currently-Submitted or -Accepted declaration for the
// (org, year). Used as the "reset" step in the lifecycle spec instead of
// the admin DELETE route — DELETE requires JOURNEY_USER credentials and
// isn't reachable through the CDP protected gateway. The unsubmitted
// endpoint's filter treats Cancelled declarations as absent, so cancelling
// is functionally equivalent to deleting for our purposes.
export async function cancelActiveDeclarations(
  request,
  orgId,
  { year = new Date().getFullYear(), reason = 'Lifecycle-test reset' } = {}
) {
  let declarations
  try {
    declarations = await listDeclarations(request, orgId, year)
  } catch (err) {
    // The per-org list route 404s for orgs with no declarations (or for
    // orgs the endpoint doesn't recognise). Either way, "no active
    // declarations to cancel" is exactly the state we want to be in, so
    // treat 404 as an empty list and move on. Re-throw anything else.
    if (/\bfailed:\s*404\b/.test(String(err.message ?? err))) {
      declarations = []
    } else {
      throw err
    }
  }
  const active = declarations.filter(
    (d) =>
      d.status === DECLARATION_STATUS.Submitted ||
      d.status === DECLARATION_STATUS.Accepted
  )
  for (const d of active) {
    // eslint-disable-next-line no-await-in-loop
    await setDeclarationStatus(
      request,
      orgId,
      d.id,
      DECLARATION_STATUS.Cancelled,
      reason
    )
  }
  return active.length
}

// Polls a predicate until it returns truthy or the timeout expires. Used
// by the lifecycle spec to bridge any indexing / eventual-consistency
// delay between a create/patch and the unsubmitted list reflecting it.
export async function waitFor(
  predicate,
  { timeoutMs = 30_000, intervalMs = 2_000, label = 'condition' } = {}
) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    last = await predicate()
    if (last) return last
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(
    `waitFor("${label}") timed out after ${timeoutMs}ms; last value: ${JSON.stringify(last)}`
  )
}

// GET /compliance-declarations/unsubmitted with the supplied query params.
// Adds the CDP gateway's `x-api-key` header when
// WASTE_OBLIGATIONS_API_KEY is set — required for the protected route,
// harmlessly ignored on local. Returns the raw `APIResponse` (so
// transcripts can capture status + headers), the URL that was called, and
// the parsed JSON body. Does NOT throw on non-2xx — the spec often wants
// to assert on 4xx responses too.
export async function searchUnsubmitted(request, params = {}) {
  const url = unsubmittedUrl(params)
  const response = await request.get(url, {
    headers: { Accept: 'application/json', ...authHeaders() }
  })
  let body
  try {
    body = await response.json()
  } catch {
    body = await response.text()
  }
  return { url, response, body }
}

// Resolves the live organisationId for a known org by hitting the search
// endpoint with its reference number + filters. Walks pages until either
// found or exhausted so a large tst result set doesn't yield a false
// negative. Returns null when the org isn't in the unsubmitted list —
// either it has an active declaration or the reference is unknown.
export async function resolveLiveOrg(
  request,
  org,
  { year = new Date().getFullYear() } = {}
) {
  const match = await findRowByReference(request, org, { year })
  if (!match) return null
  return { ...org, organisationId: match.organisationId, name: match.name }
}

// Walks up to 20 pages of the unsubmitted list under the (country,
// registrationType, search=ref) filter looking for a specific reference
// number. Server-side search narrows the result set aggressively; the
// walk exists so we never wrongly declare "not present" because our
// target happened to be on page 2 of a broad match.
async function findRowByReference(request, org, { year }) {
  return findRowMatchingRef(request, org.referenceNumber, {
    year,
    registrationType: org.registrationType,
    country: org.country,
    search: org.referenceNumber
  })
}

// General-purpose paginated walk: search the unsubmitted list under
// arbitrary filters, then walk pages looking for a row with the target
// reference number. Used by the AC4 tests where the search term is a
// name substring (e.g. "CS_GENERATED") — a broad match may spill the
// target off page 1.
export async function findRowMatchingRef(
  request,
  targetReferenceNumber,
  { year = new Date().getFullYear(), registrationType, country, search } = {}
) {
  let page = 1
  const pageSize = 100
  while (page <= 20) {
    // eslint-disable-next-line no-await-in-loop
    const { body } = await searchUnsubmitted(request, {
      obligationYear: year,
      registrationType,
      country,
      search,
      pageSize,
      page
    })
    const rows = body.unsubmittedOrganisations ?? []
    const hit = rows.find((r) => r.referenceNumber === targetReferenceNumber)
    if (hit) return hit
    if (rows.length < pageSize) return null
    page += 1
  }
  return null
}

// Convenience: does the endpoint currently list an org with this reference?
// Sweeps the paged list — the tst dataset is small enough that a bounded
// walk is cheaper than server-side search + edge cases around partial
// matches on shared substrings.
export async function isOrgListedUnsubmitted(
  request,
  org,
  { year = new Date().getFullYear() } = {}
) {
  let page = 1
  const pageSize = 100
  // 20 pages × 100 rows = 2000 rows — a generous ceiling for the test env.
  while (page <= 20) {
    // eslint-disable-next-line no-await-in-loop
    const { body } = await searchUnsubmitted(request, {
      obligationYear: year,
      registrationType: org.registrationType,
      country: org.country,
      pageSize,
      page
    })
    const rows = body.unsubmittedOrganisations ?? []
    if (rows.some((r) => r.referenceNumber === org.referenceNumber)) {
      return true
    }
    if (rows.length < pageSize) return false
    page += 1
  }
  return false
}
