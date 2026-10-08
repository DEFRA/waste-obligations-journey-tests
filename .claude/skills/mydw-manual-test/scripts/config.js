'use strict'

const path = require('path')

// The skill lives in waste-obligations-journey-tests/.claude/skills/mydw-manual-test. Evidence is written to this
// repo's (gitignored) evidence/ folder; the local docker stack is the sibling epr-local-environment checkout.
const EVIDENCE_REPO =
  process.env.MYDW_EVIDENCE_REPO ||
  path.resolve(__dirname, '..', '..', '..', '..')
const EPR_ROOT = process.env.MYDW_EPR_ROOT || path.dirname(EVIDENCE_REPO)
const LOCAL_ENV_ROOT =
  process.env.MYDW_LOCAL_ENV_ROOT ||
  path.join(EPR_ROOT, 'epr-local-environment')

const FRONTEND_BASE = 'https://localhost:7084'
const B2C_USERS_FILE = path.join(
  LOCAL_ENV_ROOT,
  'mocks',
  'B2CMock',
  'users.json'
)

const CONTAINERS = {
  frontend: 'epr-local-environment-epr-packaging-frontend-1',
  sql: 'epr-local-environment-sqledge-1'
}

// Seeded accounts (mocks/B2CMock/users.json). orgExternalId is the OrganisationId PRNs are issued to.
const ORG_TYPES = {
  DRP: {
    label: 'Direct Registered Producer',
    orgName: 'POP QUEST LTD (165282)',
    orgExternalId: 'E2316C5E-D434-41DA-8274-494DC0762D20',
    prnPrefix: 'DP-PRN-',
    submissionName: 'certificate of compliance'
  },
  CS: {
    label: 'Compliance Scheme',
    orgName: 'Organisation Name (100002)',
    orgExternalId: 'D93376E3-0681-46BE-AEB4-7450A2E784D8',
    prnPrefix: 'PRN-',
    submissionName: 'statement of compliance'
  }
}

const ROLES = {
  AP: 'Approved Person',
  DP: 'Delegated Person',
  BU: 'Basic User'
}

// Time-shift scenarios. The frontend runs under `faketime -f '<TIMESHIFT_DATETIME>'` (no '@'), so the clock is FROZEN.
// C = current compliance year (Feb..Jan, so January belongs to the previous year).
const SCENARIOS = {
  S0: {
    label: 'No time shift (real clock)',
    timeshift: null,
    complianceYear: null,
    summary:
      'Real date. DW PRNs for C offer [C, C+1] until 1 Feb C+1, but the blue flash tag only shows in Dec/Jan.'
  },
  S1: {
    label: 'December window',
    timeshift: '2026-12-15 12:00:00',
    complianceYear: 2026,
    summary:
      'C=2026. DW 2026 PRNs offer 2026 or 2027. Flash tag shows for DW PRNs issued 1 Dec 2026–31 Jan 2027.'
  },
  S2: {
    label: 'Last second of January window',
    timeshift: '2027-01-31 23:59:59',
    complianceYear: 2026,
    summary:
      'C=2026 (January counts as previous year). DW 2026 PRNs still offer 2026 or 2027. Boundary test.'
  },
  S3: {
    label: 'After the window',
    timeshift: '2027-02-01 00:00:01',
    complianceYear: 2027,
    summary:
      'C=2027. DW 2026 PRNs offer 2027 only; standard 2026 PRNs no longer actionable; 2027 PRNs become actionable. Year picker offers 2028..2025.'
  },
  S4: {
    label: 'December window, following year',
    timeshift: '2027-12-15 12:00:00',
    complianceYear: 2027,
    summary:
      'C=2027. DW 2027 PRNs offer 2027 or 2028 with a tag; DW 2026 PRNs offer 2027 only. Checks the year rules are not hard-coded to 2026.'
  }
}

// Research hypotheses from "Multi-Year and December Waste – June 2026" topic guide (Walt Buchan).
const HYPOTHESES = {
  H1: 'Dashboard tile: 2026 deadline framing suppresses the "by year" signal (micro-break in task flow).',
  H2: 'Year selection: first-time users do not understand why 2027 is offered.',
  H3: 'Accept/reject list: reject action is not discoverable from the list screen.',
  H4: 'Year confirmation: binary question with unequal options causes decision paralysis.',
  H5: 'Success screen: users need to verify the outcome on the obligations grid; "view <year> obligations" should be primary.',
  H6: 'Bulk flow: split review/confirm and ambiguous navigation increase error risk and hurt recovery.'
}

function parseArgs(argv) {
  const out = { flags: new Set(), opts: {} }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      out.flags.add(key)
    } else {
      out.opts[key] = next
      i += 1
    }
  }
  return out
}

function requireOpt(opts, name) {
  const v = opts[name]
  if (!v) throw new Error(`Missing required --${name}`)
  return v
}

function evidenceRoot(ticket) {
  return path.join(EVIDENCE_REPO, 'evidence', 'MYDW', ticket)
}

function timestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

// Resolves the seeded B2C-mock user for an org/role from users.json, so the skill follows edits to that file.
function userFor(orgType, role) {
  const org = ORG_TYPES[orgType]
  if (!org)
    throw new Error(
      `Unknown --org-type ${orgType} (allowed: ${Object.keys(ORG_TYPES).join(', ')})`
    )
  const roleLabel = ROLES[role]
  if (!roleLabel)
    throw new Error(
      `Unknown --role ${role} (allowed: ${Object.keys(ROLES).join(', ')})`
    )
  const users = JSON.parse(require('fs').readFileSync(B2C_USERS_FILE, 'utf8'))
  const user = users.find(
    (u) => u.organisation === org.orgName && u.role === roleLabel
  )
  if (!user)
    throw new Error(`No ${roleLabel} for ${org.orgName} in ${B2C_USERS_FILE}`)
  return {
    ...org,
    userId: user.userId,
    email: user.email,
    userName: `${user.givenName} ${user.familyName}`,
    roleLabel
  }
}

module.exports = {
  EPR_ROOT,
  LOCAL_ENV_ROOT,
  EVIDENCE_REPO,
  REPO_ROOT: EVIDENCE_REPO,
  FRONTEND_BASE,
  B2C_USERS_FILE,
  CONTAINERS,
  ORG_TYPES,
  ROLES,
  SCENARIOS,
  HYPOTHESES,
  parseArgs,
  requireOpt,
  evidenceRoot,
  timestamp,
  userFor
}
