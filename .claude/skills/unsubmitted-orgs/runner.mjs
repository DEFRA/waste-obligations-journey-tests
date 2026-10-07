#!/usr/bin/env node
// Runner for the Unsubmitted Organisations Search API verification.
//
// 1. Creates evidence/api/unsubmitted-orgs_<timestamp>/transcripts/
// 2. Runs tests/unsubmitted-organisations-api.spec.js with EVIDENCE_DIR set
// 3. Builds a Word evidence pack (cover + transcripts)
//
// Usage:
//   node .claude/skills/unsubmitted-orgs/runner.mjs [--obligation-year YYYY] [--headed]
//   npm run test:unsubmitted-orgs -- [--obligation-year YYYY]

import { execFile } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--obligation-year') args.obligationYear = argv[++i]
    else if (a === '--headed') args.headed = true
    else if (a === '-h' || a === '--help') args.help = true
    else throw new Error(`Unknown flag: ${a}`)
  }
  return args
}

function usage() {
  return `\nUsage:\n  node .claude/skills/unsubmitted-orgs/runner.mjs [--obligation-year YYYY] [--headed]\n\nProduces an evidence .docx under evidence/api/unsubmitted-orgs_<timestamp>/\nfor the Unsubmitted Organisations Search endpoint.\n`
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

function requireEnv(key) {
  const v = process.env[key]
  if (!v) throw new Error(`Missing required env var: ${key}`)
  return v
}

// Reads Playwright's JSON reporter output and flattens it into a
// { title, status, durationMs, error }[] array the docx builder can render
// as a summary table. Playwright's JSON shape is nested (suites → specs →
// tests → results); we walk it and pick the last result per test (last
// = final attempt if retries fired).
async function readTestResults(jsonReportPath) {
  let raw
  try {
    raw = await readFile(jsonReportPath, 'utf8')
  } catch {
    return []
  }
  let report
  try {
    report = JSON.parse(raw)
  } catch {
    return []
  }
  const flat = []
  const walkSuites = (suites, describePath = []) => {
    for (const suite of suites ?? []) {
      const nextPath = suite.title ? [...describePath, suite.title] : describePath
      for (const spec of suite.specs ?? []) {
        for (const t of spec.tests ?? []) {
          const last = t.results?.[t.results.length - 1] ?? {}
          const status =
            last.status ??
            (t.status === 'skipped' ? 'skipped' : 'unknown')
          flat.push({
            title: [...nextPath, spec.title].filter(Boolean).join(' › '),
            status,
            durationMs: last.duration ?? 0,
            error: last.error?.message || last.errors?.[0]?.message || ''
          })
        }
      }
      walkSuites(suite.suites, nextPath)
    }
  }
  walkSuites(report.suites)
  return flat
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

async function main() {
  const args = parseArgs(process.argv)
  if (args.help) {
    console.log(usage())
    process.exit(0)
  }

  // Backend base URL: prefer explicit override, otherwise resolved from
  // ENVIRONMENT by getBackendBaseUrl(). Fail early on the auth vars so the
  // spec doesn't waste a run on missing creds.
  requireEnv('WASTE_OBLIGATION_USERNAME')
  requireEnv('WASTE_OBLIGATION_PASSWORD')
  // Shared envs (tst/dev) go through the CDP protected gateway which needs
  // an x-api-key header alongside the Basic Auth. Local hits the service
  // directly and doesn't need it, so the check is skipped there.
  const targetEnv =
    process.env.REGULATOR_ENVIRONMENT || process.env.ENVIRONMENT || 'tst'
  if (targetEnv !== 'local' && !process.env.WASTE_OBLIGATIONS_API_KEY) {
    throw new Error(
      'WASTE_OBLIGATIONS_API_KEY is required for the CDP protected gateway ' +
        '(tst/dev). Add it to .env — or set ENVIRONMENT=local for a direct-to-service run.'
    )
  }

  const ts = timestamp()
  const evidenceDir = path.join(
    REPO_ROOT,
    'evidence',
    'api',
    `unsubmitted-orgs_${ts}`
  )
  await mkdir(path.join(evidenceDir, 'transcripts'), { recursive: true })

  console.log(`\n=== Unsubmitted Orgs Search — evidence: ${evidenceDir} ===`)

  const jsonReportPath = path.join(evidenceDir, 'playwright-results.json')
  const env = {
    ...process.env,
    EVIDENCE_DIR: evidenceDir,
    ENVIRONMENT:
      process.env.REGULATOR_ENVIRONMENT || process.env.ENVIRONMENT || 'tst',
    // This is an API-only spec — no browser auth needed. Skip the shared
    // auth.setup dependency so a B2C outage or a tst FE hiccup doesn't take
    // down the API run.
    SKIP_AUTH_SETUP: '1',
    // Emit a JSON report so the runner can build a per-test summary table
    // in the evidence pack. Kept alongside the existing 'list' output for
    // human readability in the terminal.
    PLAYWRIGHT_JSON_OUTPUT_NAME: jsonReportPath
  }
  if (args.obligationYear) env.OBLIGATION_YEAR = args.obligationYear

  const specArgs = [
    'playwright',
    'test',
    'tests/unsubmitted-organisations-api.spec.js',
    'tests/unsubmitted-organisations-lifecycle.spec.js',
    '--project=chrome-mac',
    '--reporter=list,json'
  ]
  if (args.headed) specArgs.push('--headed')

  const result = await spawnPlaywright('npx', specArgs, {
    cwd: REPO_ROOT,
    env,
    label: 'api'
  })

  const status = result.code === 0 ? 'PASSED' : 'FAILED'
  const testResults = await readTestResults(jsonReportPath)
  const { buildEvidenceDoc } = await import(
    path.join(REPO_ROOT, 'utils', 'word-doc-builder.js')
  )
  const outputPath = path.join(evidenceDir, `unsubmitted-orgs_${ts}.docx`)
  await buildEvidenceDoc({
    title: 'Unsubmitted Organisations Search — API Verification',
    // No screenshots — this is an API-only spec.
    screenshotsDir: null,
    transcriptsDir: path.join(evidenceDir, 'transcripts'),
    outputPath,
    journey: 'Unsubmitted Orgs',
    regulator: env.ENVIRONMENT,
    orgType: 'API',
    timestamp: ts,
    status,
    testResults
  })
  console.log(`[runner] evidence pack: ${outputPath}`)
  process.exit(result.code)
}

main().catch((err) => {
  console.error(err.stack || err)
  process.exit(1)
})
