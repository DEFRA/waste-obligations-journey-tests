import { REGULATORS, ORG_TYPES, tstAccount } from './tst-accounts.js'

export { REGULATORS, ORG_TYPES }

// Lookup for a single (regulator, org-type) run.
//
// Regulator codes: EA (England), NRW (Wales), SEPA (Scotland), NIEA (Northern Ireland).
// Org type codes:  DRP (Direct-Registrant Large Producer), CS (Compliance Scheme).
//
// A journey run picks one account and threads its `orgId` through both the
// producer-side flow and the regulator-side approve/cancel flow.
//
// The accounts themselves (username, password, org ids) are not in the repo: they come
// from the gitignored data/tst-accounts.json (utils/tst-accounts.js).

export const REGULATOR_TO_NATION = {
  EA: 'England',
  NRW: 'Wales',
  SEPA: 'Scotland',
  NIEA: 'Northern Ireland'
}

export const REGULATOR_TO_HOME_NATION = {
  EA: 'EN',
  NRW: 'WA',
  SEPA: 'SC',
  NIEA: 'NI'
}

export const REGULATOR_MAILBOX = {
  EA: 'packagingproducers@environment-agency.gov.uk',
  NRW: 'packaging@naturalresourceswales.gov.uk',
  SEPA: 'producer.responsibility@sepa.org.uk',
  NIEA: 'packaging@daera-ni.gov.uk'
}

export function resolveMatrixEntry(regulator, orgType) {
  if (!REGULATORS.includes(regulator)) {
    throw new Error(
      `Unknown regulator "${regulator}". Expected one of: ${REGULATORS.join(', ')}`
    )
  }
  if (!ORG_TYPES.includes(orgType)) {
    throw new Error(
      `Unknown orgType "${orgType}" for regulator ${regulator}. Expected one of: ${ORG_TYPES.join(', ')}`
    )
  }
  return {
    regulator,
    orgType,
    nation: REGULATOR_TO_NATION[regulator],
    homeNation: REGULATOR_TO_HOME_NATION[regulator],
    regulatorMailbox: REGULATOR_MAILBOX[regulator],
    isComplianceScheme: orgType === 'CS',
    ...tstAccount(regulator, orgType)
  }
}
