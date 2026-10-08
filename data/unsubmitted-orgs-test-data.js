// Known org test data for the Unsubmitted Organisations Search endpoint.
//
// Each entry is a real tst org that the endpoint should surface as
// "unsubmitted" whenever it has no live compliance declaration for the
// current year. Used by the AC spec to make strong positive assertions
// (this org must appear, in this country, with this reference number) and
// by the lifecycle spec to walk state transitions.
//
// If the tst env is refreshed and orgIds change, this file is the single
// place to update.

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

// DP (Direct-Registrant Large Producer) test accounts — one per nation.
// `referenceNumber` is the value the endpoint returns and the value AC4's
// partial-search test uses. `organisationId` is the GUID the create/patch
// declaration endpoints need.
export const DP_ORGS = Object.freeze({
  'GB-ENG': {
    country: 'GB-ENG',
    registrationType: 'DirectProducer',
    email: 'francis.chelladurai+tst+England+CSOC1@equalexperts.com',
    referenceNumber: '339509',
    organisationId: '168498ac-3244-43d1-92fc-053934cd20a3',
    name: 'NIMBLEVIEW LTD'
  },
  'GB-WLS': {
    country: 'GB-WLS',
    registrationType: 'DirectProducer',
    email: 'francis.chelladurai+tst+Wales+CSOC2@equalexperts.com',
    referenceNumber: '339556',
    organisationId: 'd9fe0d62-d77a-43ac-9b9b-ff9d554d6b83',
    name: 'TORITSE LIMITED'
  },
  'GB-SCT': {
    country: 'GB-SCT',
    registrationType: 'DirectProducer',
    email: 'francis.chelladurai+tst+Scotland+CSOC3@equalexperts.com',
    referenceNumber: '339557',
    organisationId: 'e8198b3c-bf74-4a07-89fb-2bbfdb4af285',
    name: 'NOVA HIGHLAND CLEANING LTD'
  },
  'GB-NIR': {
    country: 'GB-NIR',
    registrationType: 'DirectProducer',
    email: 'francis.chelladurai+tst+NI+CSOC4@equalexperts.com',
    referenceNumber: '339558',
    organisationId: '41dc9e2b-a64d-4ac5-abb7-b537c88dd882',
    name: 'OSCEWEAR LTD'
  }
})

// CSO (Compliance Scheme) test accounts — one per nation.
export const CSO_ORGS = Object.freeze({
  'GB-ENG': {
    country: 'GB-ENG',
    registrationType: 'ComplianceScheme',
    email: 'francis.chelladurai+tst+CSO+England+CSOC99810@equalexperts.com',
    referenceNumber: '339579',
    organisationId: '871a1ffc-7dc4-454f-a5ea-c0535ab64452',
    name: 'CS_GENERATED_6428368_England'
  },
  'GB-WLS': {
    country: 'GB-WLS',
    registrationType: 'ComplianceScheme',
    email: 'francis.chelladurai+tst+CSO+Wales+CSOC10640@equalexperts.com',
    referenceNumber: '339581',
    organisationId: 'bad480e3-ba40-45e8-93ad-e7a6a482edb8',
    name: 'CS_GENERATED_8602833_Wales'
  },
  'GB-SCT': {
    country: 'GB-SCT',
    registrationType: 'ComplianceScheme',
    email: 'francis.chelladurai+tst+CSO+Scotland+CSOC08473@equalexperts.com',
    referenceNumber: '339583',
    organisationId: 'dca57f96-0b55-4136-9456-5817830436bc',
    name: 'CS_GENERATED_3215350_Scotland'
  },
  'GB-NIR': {
    country: 'GB-NIR',
    registrationType: 'ComplianceScheme',
    email: 'francis.chelladurai+tst+CSO+NI+CSOC68920@equalexperts.com',
    referenceNumber: '339585',
    organisationId: '6c0d6557-1dae-4337-afdf-99aa9dc0eb6f',
    name: 'CS_GENERATED_7028818_Northern Ireland'
  }
})

export function orgFor(country, registrationType) {
  const table = registrationType === 'ComplianceScheme' ? CSO_ORGS : DP_ORGS
  return table[country]
}

export function allKnownOrgs() {
  return [...Object.values(DP_ORGS), ...Object.values(CSO_ORGS)]
}
