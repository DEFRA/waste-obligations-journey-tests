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
  const baseUrl = usesPackagingEntryPoint()
    ? requireEnv('WASTE_OBLIGATIONS_FRONTEND_BASE_URL')
    : getJourneyBaseUrl()
  const url = new URL(baseUrl)
  const prefix = url.pathname.replace(/\/$/, '')
  const organisationId = requireEnv('WASTE_OBLIGATION_ORG_ID')
  url.pathname = `${prefix}/producer/${organisationId}/prns`
  url.search = new URLSearchParams({ year: String(year) }).toString()
  url.hash = ''
  return url
}
