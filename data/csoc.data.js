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
