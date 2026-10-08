export const TEST_USER_NAME = 'Test User'

export const REGULATOR_EMAIL_DP =
  'packaging-producers@environment-agency.gov.uk'
export const REGULATOR_EMAIL_CSO = 'producer.responsibility@sepa.org.uk'

export const EXPECTED_ORG_DP = {
  name: 'POP QUEST LTD',
  id: '100003',
  address:
    '2 Example Street, Riverside, Bristol, Somerset, BS1 5AH, United Kingdom',
  nameOnAccount: 'Direct Producer',
  regulator: 'Environment Agency'
}

export const EXPECTED_ORG_CSO = {
  complianceScheme: 'Trading Name',
  complianceSchemeOperator: 'Organisation Name',
  id: '100002',
  address: '',
  nameOnAccount: 'First name Last Name',
  regulator: 'Environment Agency'
}

export const DECLARATION_STATUS = Object.freeze({
  Submitted: 'Submitted',
  Accepted: 'Accepted',
  Cancelled: 'Cancelled'
})

export const REGULATOR = Object.freeze({
  EA: {
    code: 'EA',
    name: 'Environment Agency',
    jurisdiction: 'England',
    nation: 'EN',
    mailbox: 'packagingproducers@environment-agency.gov.uk'
  },
  NRW: {
    code: 'NRW',
    name: 'Natural Resources Wales',
    jurisdiction: 'Wales',
    nation: 'WA',
    mailbox: 'packaging@naturalresourceswales.gov.uk'
  },
  SEPA: {
    code: 'SEPA',
    name: 'Scottish Environment Protection Agency',
    jurisdiction: 'Scotland',
    nation: 'SC',
    mailbox: 'producer.responsibility@sepa.org.uk'
  },
  NIEA: {
    code: 'NIEA',
    name: 'Northern Ireland Environment Agency',
    jurisdiction: 'Northern Ireland',
    nation: 'NI',
    mailbox: 'packaging@daera-ni.gov.uk'
  }
})

export const ORG_TYPE = Object.freeze({
  DRP: {
    code: 'DRP',
    label: 'Direct-Registrant Large Producer',
    submissionName: 'Certificate of Compliance'
  },
  CS: {
    code: 'CS',
    label: 'Compliance Scheme',
    submissionName: 'Statement of Compliance'
  }
})

// Journey identifiers used by the skill orchestrator. Anything not listed here
// is rejected before Playwright starts, so a typo fails fast rather than
// silently no-op'ing through the dispatch switch.
export const JOURNEYS = Object.freeze([
  'E2E-00',
  'E2E-01.1',
  'E2E-01.2',
  'E2E-01.3a',
  'E2E-01.3b',
  'E2E-01.3c',
  'E2E-02',
  'E2E-03',
  'E2E-04',
  'E2E-05',
  'E2E-06',
  'E2E-07',
  'E2E-08',
  'E2E-09'
])
