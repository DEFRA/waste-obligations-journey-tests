import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

// Lookup for a single (regulator, org-type) run.
//
// Regulator codes: EA (England), NRW (Wales), SEPA (Scotland), NIEA (Northern Ireland).
// Org type codes:  DRP (Direct-Registrant Large Producer), CS (Compliance Scheme).
//
// A journey run picks one account and threads its `orgId` through both the
// producer-side flow and the regulator-side approve/cancel flow.
//
// The accounts themselves (username, password, org ids) are not in the repo: each
// user keeps them in data/accounts.json (gitignored), copied from
// accounts.example.json. See data/README.md.

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

const ACCOUNTS_FILE = fileURLToPath(new URL('./accounts.json', import.meta.url))
const REQUIRED = [
  'username',
  'password',
  'companyName',
  'orgId',
  'organisationId'
]
let accounts

// The tst accounts, read on first use so specs still list without the file.
export function loadAccounts() {
  if (accounts) return accounts
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    throw new Error(
      'csoc-e2e accounts missing: copy .claude/skills/csoc-e2e/data/accounts.example.json to accounts.json ' +
        'and fill it in (see data/README.md)'
    )
  }
  accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'))
  return accounts
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
  const entry = loadAccounts()[regulator]?.[orgType]
  const missing = REQUIRED.filter((k) => !entry?.[k])
  if (orgType === 'CS' && !entry?.complianceSchemeId)
    missing.push('complianceSchemeId')
  if (missing.length) {
    throw new Error(
      `accounts.json ${regulator}.${orgType} is missing ${missing.join(', ')} (see data/README.md)`
    )
  }
  return {
    regulator,
    orgType,
    nation: REGULATOR_TO_NATION[regulator],
    homeNation: REGULATOR_TO_HOME_NATION[regulator],
    regulatorMailbox: REGULATOR_MAILBOX[regulator],
    isComplianceScheme: orgType === 'CS',
    ...entry
  }
}
