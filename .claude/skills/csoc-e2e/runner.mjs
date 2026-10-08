#!/usr/bin/env node
// CSoC E2E skill orchestrator.
//
// 1. Resolves a (journey, regulator, org-type) triple to test data.
// 2. Resets the shared backend org via the existing declarations API.
// 3. Runs the producer-side Playwright spec (this repo).
// 4. Runs the regulator-side Playwright spec (sibling repo).
// 5. Builds a Word evidence pack from the screenshots captured across both.
// 6. Captures the notification emails each submit / cancel / resubmit phase
//    triggered (headless Claude + the Gmail connector, see email-capture.mjs),
//    renders them and folds them into the pack. --no-emails skips this.
//
// Usage:
//   node .claude/skills/csoc-e2e/runner.mjs \
//     --journey E2E-01.1 --regulator EA --org-type DRP
//   node .claude/skills/csoc-e2e/runner.mjs --matrix all --journey E2E-01.1
//
// Environment: reads .env in this repo. Requires the vendor/waste-packaging-regulator-tests submodule
// (.claude/skills/csoc-e2e/setup-regulator.sh; REGULATOR_TESTS_PATH overrides its location), REGULATOR_EMAIL_*, REGULATOR_PASSWORD, and the existing EPR / waste-
// obligations creds. Overrides EPR_USER_EMAIL and WASTE_OBLIGATION_ORG_ID per
// run so the producer auth setup logs in as the matrix-selected account.

import { execFile } from 'node:child_process'
import {
  access,
  copyFile,
  mkdir,
  readdir,
  rm,
  writeFile
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'
import { captureEmails } from './email-capture.mjs'
import { REPO_ROOT, buildEvidencePack, writeRunInfo } from './evidence-pack.mjs'
import { renderEmails } from './render-emails.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const REGULATOR_TO_NATION_ID = {
  EA: 'EN',
  NRW: 'WS',
  SEPA: 'SC',
  NIEA: 'NI'
}

function parseArgs(argv) {
  const args = { matrix: null }
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--journey') args.journey = argv[++i]
    else if (arg === '--regulator') args.regulator = argv[++i]
    else if (arg === '--org-type') args.orgType = argv[++i]
    else if (arg === '--matrix') args.matrix = argv[++i]
    else if (arg === '--headed') args.headed = true
    else if (arg === '--no-emails') args.noEmails = true
    else if (arg === '--dry-run') args.dryRun = true
    else if (arg === '-h' || arg === '--help') args.help = true
    else throw new Error(`Unknown flag: ${arg}`)
  }
  return args
}

function usage() {
  return `\nUsage:\n  node .claude/skills/csoc-e2e/runner.mjs --journey <code> --regulator <EA|NRW|SEPA|NIEA> --org-type <DRP|CS>\n  node .claude/skills/csoc-e2e/runner.mjs --journey <code> --matrix all\n  node .claude/skills/csoc-e2e/runner.mjs --journey all [--regulator <code>] [--org-type <code>]\n\nFlags:\n  --headed        Run Playwright headed (visible browser).\n  --no-emails     Skip notification-email capture (pack shows them as pending).\n  --matrix all    Sweep every regulator × the org types the journey supports.\n  --journey all   Every implemented journey × every regulator × its org types\n                  (--regulator / --org-type narrow the sweep).\n  --dry-run       Print the planned runs and exit.\n`
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

function requireEnv(key) {
  const v = process.env[key]
  if (!v) throw new Error(`Missing required env var: ${key}`)
  return v
}

async function loadMatrix() {
  const module = await import(path.join(__dirname, 'data', 'matrix.js'))
  return module
}

function evidenceDirFor({ journey, regulator, orgType, ts }) {
  return path.join(
    REPO_ROOT,
    'evidence',
    'CSoC',
    `${journey}_${regulator}_${orgType}_${ts}`
  )
}

async function countExistingScreenshots(dir) {
  try {
    const files = await readdir(path.join(dir, 'screenshots'))
    return files.filter((f) => f.endsWith('.png')).length
  } catch {
    return 0
  }
}

// Ordered phase list per journey. Each phase is a [side, phase-name] pair;
// the runner iterates them in order, spawning one Playwright process per
// phase. SCREENSHOT_START_AT flows forward so all phases contribute to a
// single continuous screenshot sequence in the evidence pack.
//
// Journey-01.x remain single-phase (producer → regulator) but drive through
// the same iterator so the code path is unified.
const PHASES_BY_JOURNEY = {
  'E2E-01.1': [
    ['producer', 'submit'],
    ['regulator', 'approve']
  ],
  'E2E-01.2': [
    ['producer', 'submit'],
    ['regulator', 'approve']
  ],
  // E2E-01.3a / E2E-01.3c: CS Reg 43 = NO variants. Same phase shape as
  // E2E-01.2 — one producer submit followed by regulator approve. The
  // difference between 03a and 03c is the obligation seed (MET vs NOT
  // MET) — a data-only distinction that lives outside this runner.
  'E2E-01.3a': [
    ['producer', 'submit'],
    ['regulator', 'approve']
  ],
  'E2E-01.3c': [
    ['producer', 'submit'],
    ['regulator', 'approve']
  ],
  'E2E-04': [
    ['producer', 'submit'],
    ['regulator', 'cancel'],
    ['producer', 'resubmit'],
    ['regulator', 'view-history', { expectedActions: 'Cancelled,Submitted' }]
  ],
  'E2E-08': [
    ['producer', 'submit'],
    ['regulator', 'approve'],
    ['regulator', 'cancel'],
    ['producer', 'resubmit'],
    ['regulator', 'approve'],
    [
      'regulator',
      'view-history',
      { expectedActions: 'Accepted,Cancelled,Accepted' }
    ]
  ]
}

// Org types each implemented journey applies to. E2E-01.1 is the DRP
// certificate path, E2E-01.2/01.3x the CS statement paths (the producer spec
// asserts the match); cancel/resubmit journeys run for both.
const JOURNEY_ORG_TYPES = {
  'E2E-01.1': ['DRP'],
  'E2E-01.2': ['CS'],
  'E2E-01.3a': ['CS'],
  'E2E-01.3c': ['CS'],
  'E2E-04': ['DRP', 'CS'],
  'E2E-08': ['DRP', 'CS']
}

async function runProducer(matrixEntry, evidenceDir, startAt, headed, phase) {
  const env = {
    ...process.env,
    JOURNEY: matrixEntry.journey,
    REGULATOR: matrixEntry.regulator,
    ORG_TYPE: matrixEntry.orgType,
    PHASE: phase,
    EVIDENCE_DIR: evidenceDir,
    SCREENSHOT_START_AT: String(startAt),
    // Route the producer auth/setup to the matrix-selected accounts.
    EPR_USER_EMAIL: matrixEntry.username,
    EPR_USER_PASSWORD: matrixEntry.password,
    EPR_CSO_USER_EMAIL: matrixEntry.username,
    EPR_CSO_USER_PASSWORD: matrixEntry.password,
    WASTE_OBLIGATION_ORG_ID: matrixEntry.organisationId,
    WASTE_OBLIGATION_CSO_ORG_ID: matrixEntry.organisationId,
    // Force env to the regulator target so the producer FE URL matches.
    ENVIRONMENT: process.env.REGULATOR_ENVIRONMENT || 'tst'
  }
  // Pin to one browser project — screenshot evidence doesn't need the full
  // browser matrix, and running 6 projects would multiply the evidence pack.
  const args = [
    'playwright',
    'test',
    'tests/csoc-e2e-journey.spec.js',
    '--project=chrome-mac'
  ]
  if (headed) args.push('--headed')
  // Wipe cached auth so the account switch actually takes effect.
  await rm(path.join(REPO_ROOT, 'playwright', '.auth'), {
    recursive: true,
    force: true
  })
  return spawnPlaywright('npx', args, {
    cwd: REPO_ROOT,
    env,
    label: `producer:${phase}`
  })
}

// The regulator repo is the vendor/waste-packaging-regulator-tests submodule (REGULATOR_TESTS_PATH overrides it).
// The CSoC regulator spec lives in this skill (regulator/) and is copied into the regulator repo's test/specs/ for
// each run, so it uses that repo's page objects, Playwright config and Playwright version.
const REGULATOR_SPEC = 'csoc-e2e-external.spec.js'
const REGULATOR_SETUP = '.claude/skills/csoc-e2e/setup-regulator.sh'

async function regulatorRepo() {
  const dir =
    process.env.REGULATOR_TESTS_PATH ||
    path.join(REPO_ROOT, 'vendor', 'waste-packaging-regulator-tests')
  const missing = async (rel) =>
    access(path.join(dir, rel)).then(
      () => false,
      () => true
    )
  if (await missing('package.json')) {
    throw new Error(
      `regulator tests not found at ${dir}: run ${REGULATOR_SETUP} (or clone with --recurse-submodules)`
    )
  }
  if (await missing('node_modules/@playwright/test')) {
    throw new Error(
      `regulator tests at ${dir} have no node_modules: run ${REGULATOR_SETUP}`
    )
  }
  return dir
}

async function runRegulator(
  matrixEntry,
  evidenceDir,
  startAt,
  headed,
  phase,
  phaseOpts = {}
) {
  const nationId = REGULATOR_TO_NATION_ID[matrixEntry.regulator]
  const regulatorTestsPath = await regulatorRepo()
  const emailKey = `REGULATOR_EMAIL_${matrixEntry.regulator}`
  const passwordKey = `REGULATOR_PASSWORD_${matrixEntry.regulator}`
  const env = {
    ...process.env,
    ENVIRONMENT: process.env.REGULATOR_ENVIRONMENT || 'test',
    JOURNEY: matrixEntry.journey,
    REGULATOR: matrixEntry.regulator,
    ORG_TYPE: matrixEntry.orgType,
    ORG_ID: matrixEntry.orgId,
    PHASE: phase,
    EVIDENCE_DIR: evidenceDir,
    SCREENSHOT_START_AT: String(startAt),
    NATION_ID: nationId,
    [`TEST_EMAIL_NATION_${nationId}`]: requireEnv(emailKey),
    [`TEST_PASSWORD_NATION_${nationId}`]: requireEnv(passwordKey),
    // These are consumed by the regulator playwright config once .env.test is loaded.
    packagingRegulatorBaseURL: requireEnv('REGULATOR_PORTAL_BASE_URL'),
    dashboardBaseURL: requireEnv('REGULATOR_DASHBOARD_BASE_URL'),
    // The E2E spec logs in inline against the packaging portal (fresh context,
    // no cross-subdomain session carry-over). Skip the shared auth.setup so we
    // don't pay for a login the spec is going to discard anyway.
    SKIP_AUTH_SETUP: '1'
  }
  if (phaseOpts.expectedActions) {
    env.EXPECTED_HISTORY_ACTIONS = phaseOpts.expectedActions
  }
  const args = ['playwright', 'test', `test/specs/${REGULATOR_SPEC}`]
  if (headed) args.push('--headed')
  // Wipe cached auth so a different nation triggers a fresh login.
  await rm(path.join(regulatorTestsPath, 'playwright', '.auth'), {
    recursive: true,
    force: true
  })
  const specCopy = path.join(
    regulatorTestsPath,
    'test',
    'specs',
    REGULATOR_SPEC
  )
  await copyFile(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'regulator',
      REGULATOR_SPEC
    ),
    specCopy
  )
  try {
    return await spawnPlaywright('npx', args, {
      cwd: regulatorTestsPath,
      env,
      label: `regulator:${phase}`
    })
  } finally {
    await rm(specCopy, { force: true })
  }
}

function spawnPlaywright(cmd, args, { cwd, env, label }) {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, {
      cwd,
      env,
      maxBuffer: 32 * 1024 * 1024
    })
    child.stdout?.on('data', (chunk) =>
      process.stdout.write(`[${label}] ${chunk}`)
    )
    child.stderr?.on('data', (chunk) =>
      process.stderr.write(`[${label}] ${chunk}`)
    )
    child.on('exit', (code, signal) => {
      resolve({ code: code ?? 0, signal })
    })
  })
}

// Phases that send a GOV.UK Notify email, keyed by `${side}/${phase}`.
const EMAIL_TRIGGERS = {
  'producer/submit': 'submission',
  'producer/resubmit': 'resubmission',
  'regulator/cancel': 'cancellation'
}

// How long after a triggering phase an email may still arrive, when no later
// triggering phase bounds the search window.
const EMAIL_GRACE_MS = 15 * 60 * 1000
// Small lead-in so clock skew between this machine and Gmail doesn't drop a
// message that landed right as the phase started.
const EMAIL_LEAD_MS = 60 * 1000

// Describes, per triggering phase, which mailboxes should have received an
// email and the time window to search. Each recipient carries the file stem
// Claude must use when saving what it finds under emails/.
function buildEmailExpectations(matrixEntry, phaseResults) {
  const triggered = phaseResults.filter(
    (r) => EMAIL_TRIGGERS[`${r.side}/${r.phase}`]
  )
  return triggered.map((r, i) => {
    const seq = i + 1
    const trigger = EMAIL_TRIGGERS[`${r.side}/${r.phase}`]
    const next = triggered[i + 1]
    const before = next
      ? next.startedAt
      : new Date(Date.parse(r.finishedAt) + EMAIL_GRACE_MS).toISOString()
    const stem = (role) => `${String(seq).padStart(3, '0')}_${trigger}_${role}`
    // Notify only emails the producer organisation (DRP or CS) — the
    // regulator is never a recipient for these triggers.
    const recipients = [
      {
        role: 'producer',
        address: matrixEntry.username,
        file: stem('producer')
      }
    ]
    return {
      seq,
      trigger,
      phase: `${r.side}/${r.phase}`,
      phaseExitCode: r.code,
      after: new Date(Date.parse(r.startedAt) - EMAIL_LEAD_MS).toISOString(),
      before,
      recipients,
      companyName: matrixEntry.companyName,
      journey: matrixEntry.journey,
      regulator: matrixEntry.regulator,
      orgType: matrixEntry.orgType
    }
  })
}

async function writeEmailExpectations(evidenceDir, expectations) {
  const emailsDir = path.join(evidenceDir, 'emails')
  await mkdir(emailsDir, { recursive: true })
  await writeFile(
    path.join(emailsDir, 'expected.json'),
    JSON.stringify(expectations, null, 2) + '\n'
  )
}

async function resetBackendOrg({ organisationId, orgType }) {
  // Reuse the existing helper. It reads WASTE_OBLIGATION_*_ORG_ID from env,
  // which the runner has already set to the matrix entry above the call site.
  const account = orgType === 'CS' ? 'cso' : 'dp'
  const { resetOrgDeclarations } = await import(
    path.join(REPO_ROOT, 'utils', 'test-setup.js')
  )
  try {
    await resetOrgDeclarations(account)
    console.log(`[runner] reset backend state for org ${organisationId}`)
  } catch (err) {
    console.warn(
      `[runner] reset failed for ${organisationId}: ${err.message}. Continuing —` +
        ` if the org is already clean this is safe to ignore.`
    )
  }
}

async function runOne({ journey, regulator, orgType, headed, noEmails }) {
  const { resolveMatrixEntry } = await loadMatrix()
  const entry = resolveMatrixEntry(regulator, orgType)
  const matrixEntry = { ...entry, journey }
  const ts = timestamp()
  const evidenceDir = evidenceDirFor({ journey, regulator, orgType, ts })
  await mkdir(evidenceDir, { recursive: true })

  console.log(
    `\n=== ${journey} · ${regulator} · ${orgType} — evidence: ${evidenceDir} ===`
  )
  process.env.WASTE_OBLIGATION_ORG_ID = matrixEntry.organisationId
  process.env.WASTE_OBLIGATION_CSO_ORG_ID = matrixEntry.organisationId
  await resetBackendOrg(matrixEntry)

  const phases = PHASES_BY_JOURNEY[journey]
  if (!phases) {
    throw new Error(
      `No phase plan for ${journey}. Add one to PHASES_BY_JOURNEY in runner.mjs.`
    )
  }

  const phaseResults = []
  for (const [side, phase, phaseOpts] of phases) {
    // Screenshots must number continuously across phases so the docx
    // builder orders them correctly. Each phase spec resumes from where
    // the previous one left off.
    // eslint-disable-next-line no-await-in-loop
    const currentCount = await countExistingScreenshots(evidenceDir)
    // Producer specs start at 1 by default; regulator specs start at 100
    // so a mixed phase run still keeps the producer/regulator groupings
    // visually separated by number band on the first sequence.
    const startAt = Math.max(
      currentCount,
      side === 'regulator' && phaseResults.length === 0 ? 100 : 0
    )
    console.log(
      `\n--- phase ${side}/${phase} (screenshots from ${startAt + 1}) ---`
    )
    const startedAt = new Date().toISOString()
    // eslint-disable-next-line no-await-in-loop
    const result =
      side === 'producer'
        ? await runProducer(matrixEntry, evidenceDir, startAt, headed, phase)
        : await runRegulator(
            matrixEntry,
            evidenceDir,
            startAt,
            headed,
            phase,
            phaseOpts
          )
    phaseResults.push({
      side,
      phase,
      code: result.code,
      startedAt,
      finishedAt: new Date().toISOString()
    })
    if (result.code !== 0) {
      console.warn(
        `[runner] phase ${side}/${phase} failed (exit ${result.code}) — subsequent phases may fail too, continuing to capture whatever evidence is possible`
      )
    }
  }

  const passed = phaseResults.every((r) => r.code === 0)
  const status = passed ? 'PASSED' : 'FAILED'
  const expectations = buildEmailExpectations(matrixEntry, phaseResults)
  await writeEmailExpectations(evidenceDir, expectations)
  await writeRunInfo(evidenceDir, {
    journey,
    regulator,
    orgType,
    ts,
    status,
    phaseResults
  })
  let emails = null
  if (expectations.length && !noEmails) {
    console.log(
      `\n--- notification emails (${expectations.length} trigger(s)) ---`
    )
    emails = await captureEmails(evidenceDir, {
      log: (line) => console.log(line)
    })
    await renderEmails(evidenceDir)
  }
  const docPath = await buildEvidencePack({
    journey,
    regulator,
    orgType,
    ts,
    evidenceDir,
    status
  })
  console.log(`[runner] evidence pack: ${docPath}`)
  if (emails) {
    console.log(
      `[runner] emails: ${emails.received}/${emails.received + emails.missing} received`
    )
  }
  console.log(
    `[runner] phase results: ${phaseResults
      .map((r) => `${r.side}/${r.phase}:${r.code === 0 ? 'PASS' : 'FAIL'}`)
      .join(', ')}`
  )
  return { passed, docPath, evidenceDir, phaseResults, emails }
}

// Expands the CLI flags into the (journey, regulator, org type) runs to do.
// A single run needs all three; --matrix all / --journey all fill in the
// missing dimensions, skipping org types a journey doesn't apply to.
async function planRuns(args) {
  const { REGULATORS, ORG_TYPES } = await loadMatrix()
  const sweep = args.matrix === 'all' || args.journey === 'all'
  if (!sweep) {
    if (!args.regulator || !args.orgType) return null
    return [
      {
        journey: args.journey,
        regulator: args.regulator,
        orgType: args.orgType
      }
    ]
  }
  const journeys =
    args.journey === 'all' ? Object.keys(PHASES_BY_JOURNEY) : [args.journey]
  const regulators = args.regulator ? [args.regulator] : REGULATORS
  return journeys.flatMap((journey) => {
    const supported = JOURNEY_ORG_TYPES[journey] ?? ORG_TYPES
    const orgTypes = args.orgType
      ? supported.filter((t) => t === args.orgType)
      : supported
    return regulators.flatMap((regulator) =>
      orgTypes.map((orgType) => ({ journey, regulator, orgType }))
    )
  })
}

function printSummary(summary) {
  console.log(`\n=== Summary: ${summary.length} run(s) ===`)
  for (const s of summary) {
    const emails = s.emails
      ? ` emails ${s.emails.received}/${s.emails.received + s.emails.missing}`
      : ''
    console.log(
      `  ${s.passed ? 'PASSED' : 'FAILED'}  ${s.journey} ${s.regulator}/${s.orgType}${emails}  ${s.docPath || s.error || ''}`
    )
  }
  const failed = summary.filter((s) => !s.passed).length
  console.log(`  ${summary.length - failed} passed, ${failed} failed`)
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.help || !args.journey) {
    console.log(usage())
    process.exit(args.help ? 0 : 1)
  }

  const runs = await planRuns(args)
  if (!runs) {
    console.error(
      '--regulator and --org-type are required unless --matrix all or --journey all is given'
    )
    console.log(usage())
    process.exit(1)
  }
  if (!runs.length) {
    console.error(
      'Nothing to run: that journey does not apply to the requested org type.'
    )
    process.exit(1)
  }
  if (runs.length > 1 || args.dryRun) {
    console.log(
      `[runner] ${runs.length} run(s):\n${runs.map((r) => `  ${r.journey} ${r.regulator}/${r.orgType}`).join('\n')}`
    )
  }

  if (args.dryRun) process.exit(0)

  const summary = []
  for (const run of runs) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await runOne({
        ...run,
        headed: args.headed,
        noEmails: args.noEmails
      })
      summary.push({ ...run, ...result })
    } catch (err) {
      console.error(
        `[runner] ${run.journey} ${run.regulator}/${run.orgType} threw: ${err.stack || err}`
      )
      summary.push({ ...run, passed: false, error: err.message })
    }
  }
  if (summary.length > 1) printSummary(summary)
  process.exit(summary.every((s) => s.passed) ? 0 : 1)
}

main().catch((err) => {
  console.error(err.stack || err)
  process.exit(1)
})
