import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { getOrgId } from './waste-obligations-api.js'

const SCRIPT = fileURLToPath(
  new URL('../scripts/seed-prns.mjs', import.meta.url)
)

// The local stack reads PRNs from its own database.
// CI reads them from WireMock - process.env.IS_CI.
const isCi = ['true', true].includes(process.env.IS_CI)

// Seeding and removing rows only makes sense on the local stack. Deployed runs
// (CDP Portal, Azure) have no sqledge container, so they must not reach docker.
const isLocal = process.env.ENVIRONMENT === 'local'

// Whether this run can put rows in the stack's database: only the local stack, and not CI's WireMock.
export const canSeedPrns = isLocal && !isCi

function runSeedScript(action, account, set = 'awaiting') {
  execFileSync(
    process.execPath,
    [SCRIPT, action, account, getOrgId(account), set],
    { stdio: 'inherit' }
  )
}

// December waste notes for the year-filter journeys, kept apart from the awaiting set the other journeys use.
export function seedYearFilterPrns(account) {
  if (!canSeedPrns) return
  runSeedScript('seed', account, 'year-filter')
}

export function removeYearFilterPrns(account) {
  if (!canSeedPrns) return
  runSeedScript('remove', account, 'year-filter')
}

export function seedAwaitingPrns(account) {
  if (isCi || !isLocal) return
  runSeedScript('seed', account)
}

// The CI WireMock scenario each account's accept journey moves. The producer's is the one the user asked for;
// the compliance scheme's accept journey runs on its own scenario.
const WIREMOCK_SCENARIO = {
  dp: 'journey-producer-bulk-accept',
  cso: 'journey-compliance-scheme-prn-accept'
}

// Local: removes the seeded PRNs from the database. Elsewhere: resets the account's WireMock accept scenario
// (when WIREMOCK_ADMIN_URL is set), so the stubbed PRN status goes back to its starting state.
export async function resetAwaitingPrns(account, request) {
  if (isCi) {
    const adminUrl = process.env.WIREMOCK_ADMIN_URL
    if (!adminUrl) return

    const scenario = WIREMOCK_SCENARIO[account]
    const response = await request.post(
      `${adminUrl}/scenarios/${scenario}/reset`
    )

    if (!response.ok()) {
      throw new Error(
        `WireMock scenario reset failed for ${scenario}: ${response.status()} ${await response.text()}`
      )
    }
  } else if (isLocal) {
    runSeedScript('remove', account)
  }
}
