// Known org test data for the Unsubmitted Organisations Search endpoint.
//
// The known orgs are the tst accounts in the gitignored data/tst-accounts.json
// (utils/tst-accounts.js): one Direct Producer and one Compliance Scheme per
// nation. The endpoint should surface each as "unsubmitted" whenever it has no
// live compliance declaration for the current year. The AC spec uses them for
// strong positive assertions (this org must appear, in this country, with this
// reference number) and the lifecycle spec to walk state transitions.

import { tstAccount } from '../utils/tst-accounts.js'

export const COUNTRIES = ['GB-ENG', 'GB-WLS', 'GB-SCT', 'GB-NIR']
export const REG_TYPES = ['DirectProducer', 'ComplianceScheme']

export const REGULATOR_BY_COUNTRY = {
  'GB-ENG': {
    name: 'Environment Agency',
    email: 'packagingproducers@environment-agency.gov.uk'
  },
  'GB-WLS': {
    name: 'Natural Resources Wales',
    email: 'packaging@naturalresourceswales.gov.uk'
  },
  'GB-SCT': {
    name: 'Scottish Environment Protection Agency',
    email: 'producer.responsibility@sepa.org.uk'
  },
  'GB-NIR': {
    name: 'Northern Ireland Environment Agency',
    email: 'packaging@daera-ni.gov.uk'
  }
}

const COUNTRY_BY_REGULATOR = {
  EA: 'GB-ENG',
  NRW: 'GB-WLS',
  SEPA: 'GB-SCT',
  NIEA: 'GB-NIR'
}

// `referenceNumber` is the value the endpoint returns and the value AC4's
// partial-search test uses. `organisationId` is the GUID the create/patch
// declaration endpoints need.
function orgsOfType(orgType, registrationType) {
  return Object.fromEntries(
    Object.entries(COUNTRY_BY_REGULATOR).map(([regulator, country]) => {
      const a = tstAccount(regulator, orgType)
      return [
        country,
        Object.freeze({
          country,
          registrationType,
          referenceNumber: String(a.orgId),
          organisationId: a.organisationId,
          name: a.companyName
        })
      ]
    })
  )
}

// Direct-Registrant Large Producers, keyed by country. Reads data/tst-accounts.json.
export function dpOrgs() {
  return orgsOfType('DRP', 'DirectProducer')
}

// Compliance Schemes, keyed by country. Reads data/tst-accounts.json.
export function csoOrgs() {
  return orgsOfType('CS', 'ComplianceScheme')
}

export function orgFor(country, registrationType) {
  const table = registrationType === 'ComplianceScheme' ? csoOrgs() : dpOrgs()
  return table[country]
}

export function allKnownOrgs() {
  return [...Object.values(dpOrgs()), ...Object.values(csoOrgs())]
}
