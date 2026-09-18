#!/usr/bin/env node
// CSoC E2E skill orchestrator.
//
// 1. Resolves a (journey, regulator, org-type) triple to test data.
// 2. Resets the shared backend org via the existing declarations API.
// 3. Runs the producer-side Playwright spec (this repo).
// 4. Runs the regulator-side Playwright spec (sibling repo).
// 5. Builds a Word evidence pack from the screenshots captured across both.
//
// Usage:
//   node .claude/skills/csoc-e2e/runner.mjs \
//     --journey E2E-01.1 --regulator EA --org-type DRP
//   node .claude/skills/csoc-e2e/runner.mjs --matrix all --journey E2E-01.1
//
// Environment: reads .env in this repo. Requires REGULATOR_TESTS_PATH,
// REGULATOR_EMAIL_*, REGULATOR_PASSWORD, and the existing EPR / waste-
// obligations creds. Overrides EPR_USER_EMAIL and WASTE_OBLIGATION_ORG_ID per
// run so the producer auth setup logs in as the matrix-selected account.

import { execFile } from 'node:child_process'
import { mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')

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
    else if (arg === '-h' || arg === '--help') args.help = true
    else throw new Error(`Unknown flag: ${arg}`)
  }
  return args
}

function usage() {
  return `\nUsage:\n  node .claude/skills/csoc-e2e/runner.mjs --journey <code> --regulator <EA|NRW|SEPA|NIEA> --org-type <DRP|CS>\n  node .claude/skills/csoc-e2e/runner.mjs --journey <code> --matrix all\n\nFlags:\n  --headed        Run Playwright headed (visible browser).\n  --matrix all    Sweep all 8 (regulator, org-type) combinations for the given journey.\n`
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

async function runProducer(matrixEntry, evidenceDir, headed) {
  const env = {
    ...process.env,
    JOURNEY: matrixEntry.journey,
    REGULATOR: matrixEntry.regulator,
    ORG_TYPE: matrixEntry.orgType,
    EVIDENCE_DIR: evidenceDir,
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
    label: 'producer'
  })
}

async function runRegulator(matrixEntry, evidenceDir, startAt, headed) {
  const nationId = REGULATOR_TO_NATION_ID[matrixEntry.regulator]
  const regulatorTestsPath = requireEnv('REGULATOR_TESTS_PATH')
  const emailKey = `REGULATOR_EMAIL_${matrixEntry.regulator}`
  const passwordKey = `REGULATOR_PASSWORD_${matrixEntry.regulator}`
  const env = {
    ...process.env,
    ENVIRONMENT: process.env.REGULATOR_ENVIRONMENT || 'test',
    JOURNEY: matrixEntry.journey,
    REGULATOR: matrixEntry.regulator,
    ORG_TYPE: matrixEntry.orgType,
    ORG_ID: matrixEntry.orgId,
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
  const args = ['playwright', 'test', 'test/specs/csoc-e2e-external.spec.js']
  if (headed) args.push('--headed')
  // Wipe cached auth so a different nation triggers a fresh login.
  await rm(path.join(regulatorTestsPath, 'playwright', '.auth'), {
    recursive: true,
    force: true
  })
  return spawnPlaywright('npx', args, {
    cwd: regulatorTestsPath,
    env,
    label: 'regulator'
  })
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

async function buildEvidencePack({
  journey,
  regulator,
  orgType,
  ts,
  evidenceDir,
  status
}) {
  const { buildEvidenceDoc } = await import(
    path.join(REPO_ROOT, 'utils', 'word-doc-builder.js')
  )
  const outputPath = path.join(
    evidenceDir,
    `${journey}_${regulator}_${orgType}_${ts}.docx`
  )
  await buildEvidenceDoc({
    screenshotsDir: path.join(evidenceDir, 'screenshots'),
    outputPath,
    journey,
    regulator,
    orgType,
    timestamp: ts,
    status
  })
  return outputPath
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

async function runOne({ journey, regulator, orgType, headed }) {
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

  const producerResult = await runProducer(matrixEntry, evidenceDir, headed)
  const startAt = await countExistingScreenshots(evidenceDir)
  const regulatorResult = await runRegulator(
    matrixEntry,
    evidenceDir,
    Math.max(startAt, 100),
    headed
  )

  const passed = producerResult.code === 0 && regulatorResult.code === 0
  const status = passed ? 'PASSED' : 'FAILED'
  const docPath = await buildEvidencePack({
    journey,
    regulator,
    orgType,
    ts,
    evidenceDir,
    status
  })
  console.log(`[runner] evidence pack: ${docPath}`)
  return { passed, docPath, evidenceDir, producerResult, regulatorResult }
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.help || !args.journey) {
    console.log(usage())
    process.exit(args.help ? 0 : 1)
  }

  if (args.matrix === 'all') {
    const { REGULATORS, ORG_TYPES } = await loadMatrix()
    const combos = REGULATORS.flatMap((r) =>
      ORG_TYPES.map((t) => ({ regulator: r, orgType: t }))
    )
    let anyFail = false
    const summary = []
    for (const combo of combos) {
      try {
        const result = await runOne({
          journey: args.journey,
          regulator: combo.regulator,
          orgType: combo.orgType,
          headed: args.headed
        })
        summary.push({ ...combo, ...result })
        if (!result.passed) anyFail = true
      } catch (err) {
        console.error(
          `[runner] ${combo.regulator}/${combo.orgType} threw: ${err.stack || err}`
        )
        anyFail = true
        summary.push({ ...combo, passed: false, error: err.message })
      }
    }
    console.log('\n=== Matrix summary ===')
    for (const s of summary) {
      console.log(
        `  ${s.regulator}/${s.orgType}: ${s.passed ? 'PASSED' : 'FAILED'} ${s.docPath || s.error || ''}`
      )
    }
    process.exit(anyFail ? 1 : 0)
  }

  if (!args.regulator || !args.orgType) {
    console.error(
      '--regulator and --org-type are required unless --matrix all is given'
    )
    console.log(usage())
    process.exit(1)
  }

  const result = await runOne({
    journey: args.journey,
    regulator: args.regulator,
    orgType: args.orgType,
    headed: args.headed
  })
  process.exit(result.passed ? 0 : 1)
}

main().catch((err) => {
  console.error(err.stack || err)
  process.exit(1)
})
