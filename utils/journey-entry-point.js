import { requireEnv } from './env.js'

const ENTRY_POINTS = {
  packaging: {
    local: 'https://localhost:7084',
    dev: 'https://rwd-dev9.azure.defra.cloud',
    tst: 'https://rwd-tst1.azure.defra.cloud'
  },
  'waste-obligations': {
    local: 'https://localhost:8015',
    dev: 'https://waste-obligations.dev.cdp-int.defra.cloud',
    tst: 'https://waste-obligations.tst.cdp-int.defra.cloud'
  }
}

export function getJourneyEntryPoint() {
  const entryPoint = process.env.JOURNEY_ENTRY_POINT || 'packaging'
  if (!Object.hasOwn(ENTRY_POINTS, entryPoint)) {
    throw new Error(
      `Unknown JOURNEY_ENTRY_POINT "${entryPoint}". Expected one of: ${Object.keys(ENTRY_POINTS).join(', ')}`
    )
  }
  return entryPoint
}

export function usesPackagingEntryPoint() {
  return getJourneyEntryPoint() === 'packaging'
}

export function getJourneyBaseUrl(defaultEnvironment = 'tst') {
  if (process.env.EPR_BASE_URL) {
    return process.env.EPR_BASE_URL
  }

  const environment = process.env.ENVIRONMENT || defaultEnvironment
  const entryPoint = getJourneyEntryPoint()
  return ENTRY_POINTS[entryPoint][environment] || ENTRY_POINTS[entryPoint].tst
}

function servicePath(path) {
  // Playwright resolves leading slashes from the origin, discarding baseURL's
  // pathname. Preserve the public routing prefix for direct service journeys.
  const prefix = usesPackagingEntryPoint()
    ? ''
    : new URL(getJourneyBaseUrl()).pathname.replace(/\/$/, '')
  return `${prefix}${path}`
}

export function getJourneyStartPath(account, year = new Date().getFullYear()) {
  if (usesPackagingEntryPoint()) {
    return '/report-data'
  }

  if (account === 'cso') {
    const schemeId = requireEnv('WASTE_OBLIGATION_CSO_ORG_ID')
    return servicePath(`/cso/${schemeId}/compliance/statement?year=${year}`)
  }

  if (account === 'dp') {
    const organisationId = requireEnv('WASTE_OBLIGATION_ORG_ID')
    return servicePath(
      `/producer/${organisationId}/compliance/certificate?year=${year}`
    )
  }

  throw new Error(`Unknown journey account "${account}". Expected dp or cso.`)
}

export function getPublicServicePath(path) {
  return servicePath(path.startsWith('/') ? path : `/${path}`)
}

function wasteObligationsFrontendUrl(pathname, search = '') {
  const url = new URL(getWasteObligationsFrontendBaseUrl())
  const prefix = url.pathname.replace(/\/$/, '')
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  url.pathname = `${prefix}${path}`
  url.search = search
  url.hash = ''
  return url
}

// Public CDP frontend origin, including any reverse-proxy prefix. Packaging
// runs use WASTE_OBLIGATIONS_FRONTEND_BASE_URL because Playwright's baseURL is
// the Azure application.
export function getWasteObligationsFrontendBaseUrl() {
  const raw = usesPackagingEntryPoint()
    ? requireEnv('WASTE_OBLIGATIONS_FRONTEND_BASE_URL')
    : getJourneyBaseUrl()
  const url = new URL(raw)
  const pathname = url.pathname.replace(/\/+$/, '')

  return `${url.origin}${pathname}/`
}

const CSOC_ACTION_PATH = /\/compliance\/(certificate|statement)(\/|$)/

// Azure CSOC buttons must open the public CDP frontend/proxy. A private
// service hostname such as waste-obligations-frontend.dev.cdp-int.defra.cloud
// is not reachable from the journey browser.
export function describeCsocActionHref(href) {
  if (!href) {
    return 'CSOC action is missing an href to the CDP certificate or statement page'
  }

  let actual
  try {
    actual = new URL(href, getWasteObligationsFrontendBaseUrl())
  } catch {
    return `CSOC action href is not a valid URL: ${href}`
  }

  if (!CSOC_ACTION_PATH.test(actual.pathname)) {
    return `CSOC action href is not a CDP certificate or statement URL: ${href}`
  }

  if (!usesPackagingEntryPoint()) {
    return null
  }

  const expected = new URL(getWasteObligationsFrontendBaseUrl())
  const expectedPrefix = expected.pathname.replace(/\/$/, '')

  if (actual.origin !== expected.origin) {
    return `CSOC action href origin ${actual.origin} does not match the public CDP frontend ${expected.origin}`
  }

  if (
    expectedPrefix &&
    actual.pathname !== expectedPrefix &&
    !actual.pathname.startsWith(`${expectedPrefix}/`)
  ) {
    return `CSOC action href is missing the ${expectedPrefix} proxy prefix: ${href}`
  }

  return null
}

export function getPublicFrontendUrl(path, search = '') {
  const query = search.startsWith('?') ? search.slice(1) : search

  return wasteObligationsFrontendUrl(path, query).href
}

export function getJourneyViewPath(account, declarationId) {
  if (account === 'cso') {
    const schemeId = requireEnv('WASTE_OBLIGATION_CSO_ORG_ID')
    return servicePath(`/cso/${schemeId}/compliance/statement/${declarationId}`)
  }

  if (account === 'dp') {
    const organisationId = requireEnv('WASTE_OBLIGATION_ORG_ID')
    return servicePath(
      `/producer/${organisationId}/compliance/certificate/${declarationId}`
    )
  }

  throw new Error(`Unknown journey account "${account}". Expected dp or cso.`)
}

// The CDP PRNs destination is independent of any certificate navigation.
export function getProducerPrnsUrl(year) {
  const organisationId = requireEnv('WASTE_OBLIGATION_ORG_ID')

  return wasteObligationsFrontendUrl(
    `/producer/${organisationId}/prns`,
    new URLSearchParams({ year: String(year) }).toString()
  )
}
