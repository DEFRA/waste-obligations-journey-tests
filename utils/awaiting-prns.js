import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { getOrgId, listAwaitingPrns } from './waste-obligations-api.js'
import { findStandardSelectablePrnsByMaterial } from './prn-selection.js'

const SCRIPT = fileURLToPath(
  new URL('../scripts/seed-prns.mjs', import.meta.url)
)

// The local stack reads PRNs from its own database.
// CI (ENVIRONMENT=local with WIREMOCK_ADMIN_URL) reads them from WireMock.
const isCi = process.env.WIREMOCK_ADMIN_URL

function runSeedScript(action, account) {
  if (isCi) return

  execFileSync(process.execPath, [SCRIPT, action, account, getOrgId(account)], {
    stdio: 'inherit'
  })
}

export function seedAwaitingPrns(account) {
  if (isCi) return
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
  } else {
    runSeedScript('remove', account)
  }
}

// The PRNs a journey uses, keyed by API material: the run's own PRNs when there
// is a run, otherwise the first standard current-year PRN of each material in
// the awaiting list.
export async function findJourneyPrns({ request, account, run, materials }) {
  if (run) {
    return Object.fromEntries(
      materials.map((material) => [
        material,
        run.prns.find((prn) => prn.material === material)
      ])
    )
  }

  return findStandardSelectablePrnsByMaterial(
    await listAwaitingPrns(request, getOrgId(account)),
    materials
  )
}
