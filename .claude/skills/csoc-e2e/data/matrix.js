// Lookup for a single (regulator, org-type) run.
//
// Regulator codes: EA (England), NRW (Wales), SEPA (Scotland), NIEA (Northern Ireland).
// Org type codes:  DRP (Direct-Registrant Large Producer), CS (Compliance Scheme).
//
// A journey run picks one entry from this table and threads its `orgId` through
// both the producer-side flow and the regulator-side approve/cancel flow.
// Additional accounts from the test-data pool can be added as `alternates` when
// journeys start eating through single-use organisations.

export const REGULATORS = ['EA', 'NRW', 'SEPA', 'NIEA']
export const ORG_TYPES = ['DRP', 'CS']

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

// Each entry's `account` is a sign-in alias, not an address: the username is CSOC_TST_EMAIL with the alias added
// (`name@domain` -> `name+<account>@domain`) and every account uses CSOC_TST_PASSWORD. Both live in .env, never here.
export const matrix = {
  EA: {
    DRP: {
      account: 'tst+England+CSOC1',
      companyName: 'NIMBLEVIEW LTD',
      orgId: '339509',
      organisationId: '168498ac-3244-43d1-92fc-053934cd20a3',
      homeNation: 'EN',
      nation: 'England',
      isComplianceScheme: false
    },
    CS: {
      account: 'tst+CSO+England+CSOC99810',
      companyName: 'CS_GENERATED_6428368_England',
      orgId: '339579',
      organisationId: '871a1ffc-7dc4-454f-a5ea-c0535ab64452',
      complianceSchemeId: '7041CCAA-5F7D-492C-B25F-703860DA1C8D',
      homeNation: 'EN',
      nation: 'England',
      isComplianceScheme: true
    }
  },
  NRW: {
    DRP: {
      account: 'tst+Wales+CSOC2',
      companyName: 'TORITSE LIMITED',
      orgId: '339556',
      organisationId: 'd9fe0d62-d77a-43ac-9b9b-ff9d554d6b83',
      homeNation: 'WA',
      nation: 'Wales',
      isComplianceScheme: false
    },
    CS: {
      account: 'tst+CSO+Wales+CSOC10640',
      companyName: 'CS_GENERATED_8602833_Wales',
      orgId: '339581',
      organisationId: 'bad480e3-ba40-45e8-93ad-e7a6a482edb8',
      complianceSchemeId: '534B5EE4-5B69-444D-8AEB-2899FBD01BDD',
      homeNation: 'WA',
      nation: 'Wales',
      isComplianceScheme: true
    }
  },
  SEPA: {
    DRP: {
      account: 'tst+Scotland+CSOC3',
      companyName: 'NOVA HIGHLAND CLEANING LTD',
      orgId: '339557',
      organisationId: 'e8198b3c-bf74-4a07-89fb-2bbfdb4af285',
      homeNation: 'SC',
      nation: 'Scotland',
      isComplianceScheme: false
    },
    CS: {
      account: 'tst+CSO+Scotland+CSOC08473',
      companyName: 'CS_GENERATED_3215350_Scotland',
      orgId: '339583',
      organisationId: 'dca57f96-0b55-4136-9456-5817830436bc',
      complianceSchemeId: '53FDA927-99E3-47A7-AA1D-27C72931830F',
      homeNation: 'SC',
      nation: 'Scotland',
      isComplianceScheme: true
    }
  },
  NIEA: {
    DRP: {
      account: 'tst+NI+CSOC4',
      companyName: 'OSCEWEAR LTD',
      orgId: '339558',
      organisationId: '41dc9e2b-a64d-4ac5-abb7-b537c88dd882',
      homeNation: 'NI',
      nation: 'Northern Ireland',
      isComplianceScheme: false
    },
    CS: {
      account: 'tst+CSO+NI+CSOC68920',
      companyName: 'CS_GENERATED_7028818_Northern Ireland',
      orgId: '339585',
      organisationId: '6c0d6557-1dae-4337-afdf-99aa9dc0eb6f',
      complianceSchemeId: 'F88EB84A-79F2-4853-9E3B-73FCFF45879E',
      homeNation: 'NI',
      nation: 'Northern Ireland',
      isComplianceScheme: true
    }
  }
}

export function resolveMatrixEntry(regulator, orgType) {
  const reg = matrix[regulator]
  if (!reg) {
    throw new Error(
      `Unknown regulator "${regulator}". Expected one of: ${REGULATORS.join(', ')}`
    )
  }
  const entry = reg[orgType]
  if (!entry) {
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
    ...entry,
    ...tstCredentials(entry.account)
  }
}

// Username and password for a matrix account, read from .env when an entry is resolved (so specs still list
// without them).
export function tstCredentials(account) {
  const base = (process.env.CSOC_TST_EMAIL || '').trim()
  const password = process.env.CSOC_TST_PASSWORD || ''
  const at = base.indexOf('@')
  if (at < 1 || !password) {
    throw new Error(
      'CSOC_TST_EMAIL and CSOC_TST_PASSWORD must be set in .env for the tst matrix accounts (see .env.example)'
    )
  }
  return {
    username: `${base.slice(0, at)}+${account}${base.slice(at)}`,
    password
  }
}
