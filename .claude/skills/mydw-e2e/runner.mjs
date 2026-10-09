#!/usr/bin/env node
// Automated MY&DW release run: tests/mydw-e2e.spec.js across accounts and, locally, time-shift scenarios.
//
//   node .claude/skills/mydw-e2e/runner.mjs --env tst   [--regulator EA|NRW|SEPA|NIEA|all] [--org-type DRP|CS|all]
//   node .claude/skills/mydw-e2e/runner.mjs --env local [--org-type DRP|CS|all] [--scenarios S2,S1,S3,S4]
//        [--cases TST-01,LOC-06|all] [--flags-off MY|DW] [--ticket MYDW-E2E] [--headed] [--no-reset]
//
// tst signs in with the csoc-e2e matrix accounts (4 regulators x DRP/CS) on the real date. Before each account
// it sets all that account's notes back to awaiting acceptance in tst1_prn (--no-reset to skip).
// local uses the seeded EA accounts (POP QUEST = DRP, Organisation Name = CS): it switches the frontend
// clock per scenario with local/stack.js, restores PRN data around every case that accepts or
// rejects, and puts the original clock and flags back at the end.
//
// Output: evidence/MYDW-E2E/<ticket>/<timestamp>/<ENV>-<REG>-<ORG>.docx per account, next to SUMMARY.docx.

import { execFile, execFileSync } from 'node:child_process'
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync
} from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect as connectPrnDb } from './prn-db.mjs'
import {
  REGULATORS,
  ORG_TYPES,
  resolveMatrixEntry
} from '../csoc-e2e/data/matrix.js'

const require = createRequire(import.meta.url)
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
)
const SKILL_DIR = path.join(REPO_ROOT, '.claude', 'skills', 'mydw-e2e')
const LOCAL = path.join(SKILL_DIR, 'local')
const SPEC = 'tests/mydw-e2e.spec.js'
// Colour codes in Playwright error messages, stripped before they go into the Word pack.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')
const BASE_URL = {
  local: 'https://localhost:7084',
  tst: 'https://rwd-tst1.azure.defra.cloud'
}

function parseArgs(argv) {
  const opts = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) opts[key] = true
    else opts[key] = argv[++i]
  }
  return opts
}

const say = (msg) => process.stdout.write(`${msg}\n`)
const stamp = () =>
  new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
const list = (value, all) =>
  !value || value === 'all'
    ? all
    : String(value)
        .split(',')
        .map((v) => v.trim().toUpperCase())

// ---------------------------------------------------------------------------- local stack control

function stack(args) {
  return execFileSync('node', ['local/stack.js', ...args], {
    cwd: SKILL_DIR,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  })
}

function localState() {
  const preflight = require(path.join(LOCAL, 'lib', 'preflight.js'))
  const env = preflight.frontendEnv()
  return {
    clock: preflight.frontendClock(),
    flags: {
      my: String(env.FeatureManagement__ShowMultiYearObligations) === 'true',
      dw: String(env.FeatureManagement__ShowDecemberWaste) === 'true'
    },
    scenario: preflight.scenarioFor(preflight.frontendClock())
  }
}

function switchScenario(id) {
  say(
    `  switching frontend clock to ${id} (restarts frontend + b2c-mock, re-seeds MYDW-* notes)`
  )
  stack(['--scenario', id])
  stack(['--restore'])
}

// Frontend restarted with one flag off via a throwaway overlay; switchScenario() later recreates it with
// the stack defaults (both flags on).
function flagsOff(which) {
  const name =
    which === 'DW'
      ? 'FeatureManagement__ShowDecemberWaste'
      : 'FeatureManagement__ShowMultiYearObligations'
  const overlay = path.join(SKILL_DIR, '.state', `flag-off-${which}.compose.yml`)
  writeFileSync(
    overlay,
    `services:\n  epr-packaging-frontend:\n    environment:\n      ${name}: "false"\n`
  )
  const { LOCAL_ENV_ROOT } = require(path.join(LOCAL, 'config.js'))
  say(`  restarting frontend with ${name}=false`)
  execFileSync(
    'docker',
    [
      'compose',
      '-f',
      'compose.yml',
      '-f',
      'compose.b2cmock.yml',
      '-f',
      'compose.timeshift.yml',
      '-f',
      overlay,
      '--profile',
      'packaging',
      '--profile',
      'timeshift-packaging',
      'up',
      '-d',
      '--no-deps',
      '--no-build',
      '--pull',
      'never',
      '--force-recreate',
      'epr-packaging-frontend'
    ],
    { cwd: LOCAL_ENV_ROOT, stdio: 'ignore' }
  )
  const start = Date.now()
  while (Date.now() - start < 240_000) {
    const health = execFileSync(
      'docker',
      [
        'inspect',
        'epr-local-environment-epr-packaging-frontend-1',
        '--format',
        '{{.State.Health.Status}}'
      ],
      { encoding: 'utf8' }
    ).trim()
    if (health === 'healthy') return
    execFileSync('sleep', ['3'])
  }
  throw new Error('frontend not healthy after restart')
}

// ---------------------------------------------------------------------------- playwright

function runSpec({
  envName,
  cell,
  scenario,
  cases,
  evidenceDir,
  now,
  flags,
  headed
}) {
  const shots = path.join(evidenceDir, 'screenshots')
  mkdirSync(shots, { recursive: true })
  const startAt = readdirSync(shots).filter((f) => f.endsWith('.png')).length
  const jsonOut = path.join(evidenceDir, `results-${scenario}.json`)
  const env = {
    ...process.env,
    MYDW_RUN: '1',
    MYDW_ENV: envName,
    REGULATOR: cell.regulator,
    ORG_TYPE: cell.orgType,
    MYDW_SCENARIO: scenario,
    MYDW_CASES: cases,
    EVIDENCE_DIR: evidenceDir,
    SCREENSHOT_START_AT: String(startAt),
    EPR_BASE_URL: BASE_URL[envName],
    ENVIRONMENT: envName === 'tst' ? 'tst' : 'local',
    SKIP_AUTH_SETUP: '1',
    PLAYWRIGHT_JSON_OUTPUT_NAME: jsonOut
  }
  if (now) env.MYDW_NOW = now
  if (flags) {
    env.MYDW_FLAG_MY = String(flags.my)
    env.MYDW_FLAG_DW = String(flags.dw)
  }
  const args = [
    'playwright',
    'test',
    SPEC,
    '--project=chrome-mac',
    '--reporter=line,json'
  ]
  if (headed) args.push('--headed')
  return new Promise((resolve) => {
    const child = execFile('npx', args, {
      cwd: REPO_ROOT,
      env,
      maxBuffer: 64 * 1024 * 1024
    })
    child.stdout.on('data', (d) =>
      process.stdout.write(String(d).replace(/^/gm, '    '))
    )
    child.stderr.on('data', (d) =>
      process.stderr.write(String(d).replace(/^/gm, '    '))
    )
    child.on('exit', () => resolve(readResults(jsonOut, scenario)))
  })
}

function readResults(file, scenario) {
  if (!existsSync(file)) return []
  const report = JSON.parse(readFileSync(file, 'utf8'))
  const out = []
  const walk = (suite) => {
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        const r = t.results[t.results.length - 1] || {}
        const skip = (t.annotations || []).find((a) => a.type === 'skip')
        if (spec.title === 'placeholder') continue
        out.push({
          title: `[${scenario}] ${spec.title}`,
          status: r.status || t.status,
          durationMs: r.duration,
          error:
            r.status === 'skipped'
              ? (skip && skip.description) || 'skipped'
              : (r.errors || [])
                  .map((e) =>
                    String(e.message || '')
                      .split('\n')
                      .slice(0, 4)
                      .join(' ')
                  )
                  .join(' | ')
                  .replace(ANSI, '')
        })
      }
    }
    for (const child of suite.suites || []) walk(child)
  }
  for (const suite of report.suites || []) walk(suite)
  return out
}

// ---------------------------------------------------------------------------- main

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const envName = String(opts.env || '').toLowerCase()
  if (!['local', 'tst'].includes(envName))
    throw new Error('--env local|tst is required')
  const orgTypes = list(opts['org-type'], ORG_TYPES)
  const regulators =
    envName === 'local' ? ['EA'] : list(opts.regulator, REGULATORS)
  if (
    envName === 'local' &&
    opts.regulator &&
    !['EA', 'ALL'].includes(String(opts.regulator).toUpperCase())
  ) {
    throw new Error(
      'LOCAL only has EA organisations seeded (POP QUEST = DRP, Organisation Name = CS)'
    )
  }
  const cases = opts.cases && opts.cases !== true ? String(opts.cases) : 'all'
  const ticket =
    opts.ticket && opts.ticket !== true ? String(opts.ticket) : 'MYDW-E2E'
  const runDir = path.join(REPO_ROOT, 'evidence', 'MYDW-E2E', ticket, stamp())
  mkdirSync(runDir, { recursive: true })

  const cells = regulators.flatMap((regulator) =>
    orgTypes.map((orgType) => ({ regulator, orgType }))
  )
  for (const c of cells) {
    if (envName === 'tst') resolveMatrixEntry(c.regulator, c.orgType) // validates the cell
    c.name = `${envName.toUpperCase()}-${c.regulator}-${c.orgType}`
    c.dir = path.join(runDir, c.name)
    c.results = []
  }

  say(
    `MY&DW E2E · ${envName} · ${cells.map((c) => c.name).join(', ')} · cases ${cases}`
  )
  let restoreClock = null
  try {
    if (envName === 'tst') {
      // Before each account: every one of its notes back to awaiting acceptance (PrnStatusId 4) in tst1_prn,
      // so the accept/reject cases have notes to act on. --no-reset skips this.
      const prnDb = opts['no-reset'] ? null : await connectPrnDb('tst')
      if (prnDb && !prnDb.available)
        throw new Error(
          `tst PRN database: ${prnDb.reason} (use --no-reset to run without it)`
        )
      for (const c of cells) {
        say(`\n▶ ${c.name}`)
        if (prnDb) {
          const e = resolveMatrixEntry(c.regulator, c.orgType)
          const n = await prnDb.resetToAwaiting(
            [e.organisationId, e.complianceSchemeId].filter(Boolean)
          )
          say(`  reset ${n} PRN/PERN(s) to awaiting acceptance in tst1_prn`)
        }
        c.results.push(
          ...(await runSpec({
            envName,
            cell: c,
            scenario: 'REAL',
            cases,
            evidenceDir: c.dir,
            headed: !!opts.headed
          }))
        )
      }
      if (prnDb) await prnDb.close()
    } else {
      const status = JSON.parse(stack(['--data-status']))
      if (!status.snapshot)
        throw new Error(
          'No PRN snapshot: run `node .claude/skills/mydw-e2e/local/stack.js --snapshot` on a freshly seeded stack'
        )
      if (!status.seeded) stack(['--seed'])
      const start = localState()
      restoreClock = start.clock.raw || null
      const scenarios = list(opts.scenarios, ['S2', 'S1', 'S3', 'S4'])
      if (opts['flags-off']) {
        const which = String(opts['flags-off']).toUpperCase()
        switchScenario('S2')
        flagsOff(which)
        scenarios.splice(0, scenarios.length, 'S2')
        for (const c of cells) c.name += `-${which}OFF`
      }
      for (const scenario of scenarios) {
        if (!opts['flags-off'] && localState().scenario !== scenario)
          switchScenario(scenario)
        else stack(['--restore'])
        const state = localState()
        say(
          `\n■ scenario ${scenario} · clock ${state.clock.now.toISOString()} · flags MY=${state.flags.my} DW=${state.flags.dw}`
        )
        for (const c of cells) {
          say(`\n▶ ${c.name} · ${scenario}`)
          c.results.push(
            ...(await runSpec({
              envName,
              cell: c,
              scenario,
              cases,
              evidenceDir: c.dir,
              now: state.clock.now.toISOString(),
              flags: state.flags,
              headed: !!opts.headed
            }))
          )
          stack(['--restore'])
        }
      }
    }
  } finally {
    if (envName === 'local' && restoreClock) {
      const current = localState()
      if (opts['flags-off'] || current.clock.raw !== restoreClock) {
        say(`\n  restoring frontend clock ${restoreClock} with both flags on`)
        stack(['--scenario', restoreClock])
      }
      stack(['--restore'])
    }
  }

  // Evidence packs: one per account next to SUMMARY.docx.
  const { buildEvidenceDoc } = await import(
    path.join(REPO_ROOT, 'utils', 'word-doc-builder.js')
  )
  const ts = path.basename(runDir)
  const summaryRows = []
  for (const c of cells) {
    const failed = c.results.some(
      (r) => r.status === 'failed' || r.status === 'timedOut'
    )
    await buildEvidenceDoc({
      screenshotsDir: path.join(c.dir, 'screenshots'),
      outputPath: path.join(runDir, `${c.name}.docx`),
      journey: `MY&DW ${envName}`,
      regulator: c.regulator,
      orgType: c.orgType,
      timestamp: ts,
      status: failed ? 'FAILED' : 'PASSED',
      title: 'MY&DW E2E Evidence Pack',
      testResults: c.results
    })
    summaryRows.push(
      ...c.results.map((r) => ({ ...r, title: `${c.name} ${r.title}` }))
    )
  }
  const empty = path.join(runDir, '.empty')
  mkdirSync(empty, { recursive: true })
  const anyFail = summaryRows.some(
    (r) => r.status === 'failed' || r.status === 'timedOut'
  )
  await buildEvidenceDoc({
    screenshotsDir: empty,
    outputPath: path.join(runDir, 'SUMMARY.docx'),
    journey: `MY&DW ${envName}`,
    regulator: cells
      .map((c) => c.regulator)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(','),
    orgType: orgTypes.join(','),
    timestamp: ts,
    status: anyFail ? 'FAILED' : 'PASSED',
    title: 'MY&DW E2E Summary',
    testResults: summaryRows
  })
  rmSync(empty, { recursive: true, force: true })

  const count = (s) => summaryRows.filter((r) => r.status === s).length
  say(
    `\nResult: ${count('passed')} passed · ${count('failed') + count('timedOut')} failed · ${count('skipped')} skipped`
  )
  for (const r of summaryRows.filter((x) => x.status !== 'passed'))
    say(
      `  ${r.status.toUpperCase().padEnd(7)} ${r.title} — ${String(r.error || '').slice(0, 220)}`
    )
  say(`Evidence: ${runDir}`)
  process.exitCode = anyFail ? 1 : 0
}

main().catch((err) => {
  process.stderr.write(`mydw-e2e: ${err.stack || err.message}\n`)
  process.exit(1)
})
