// The tst test accounts: one producer organisation per regulator × org type (EA, NRW, SEPA, NIEA × DRP, CS).
//
// They are not in the repository (it is public). Each user keeps them in data/tst-accounts.json, which is gitignored,
// copied from data/tst-accounts.example.json; see "Test accounts (tst)" in the README. The file is read on first use,
// so specs that need it still list without it; only running them requires it.

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

export const ACCOUNTS_FILE = fileURLToPath(
  new URL('../data/tst-accounts.json', import.meta.url)
)

export const REGULATORS = ['EA', 'NRW', 'SEPA', 'NIEA']
export const ORG_TYPES = ['DRP', 'CS']

const REQUIRED = [
  'username',
  'password',
  'companyName',
  'orgId',
  'organisationId'
]
let accounts

export function hasTstAccounts() {
  return fs.existsSync(ACCOUNTS_FILE)
}

export function loadTstAccounts() {
  if (accounts) return accounts
  if (!hasTstAccounts()) {
    throw new Error(
      'tst accounts missing: copy data/tst-accounts.example.json to data/tst-accounts.json and fill it in ' +
        '(see "Test accounts (tst)" in the README)'
    )
  }
  accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'))
  return accounts
}

// One account, checked for the fields the specs rely on.
export function tstAccount(regulator, orgType) {
  const entry = loadTstAccounts()[regulator]?.[orgType]
  const missing = REQUIRED.filter((k) => !entry?.[k])
  if (orgType === 'CS' && !entry?.complianceSchemeId)
    missing.push('complianceSchemeId')
  if (missing.length) {
    throw new Error(
      `data/tst-accounts.json ${regulator}.${orgType} is missing ${missing.join(', ')}`
    )
  }
  return entry
}
