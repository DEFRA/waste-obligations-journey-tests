#!/usr/bin/env node
// Deterministic pre-scan for /review-tests: what changed, and the mechanical findings on it.
//
//   node .claude/skills/review-tests/scan.mjs                 # this branch vs main, plus uncommitted and untracked files
//   node .claude/skills/review-tests/scan.mjs --base <ref>    # against another base
//   node .claude/skills/review-tests/scan.mjs --pr <n>        # a GitHub PR (added lines only; eslint too if it's checked out)
//   … [--json]
//
// Findings on changed lines are the review's business; the same checks on untouched lines of the changed files are
// listed as existing debt, never as blockers. Read-only: it runs git, gh and eslint, and writes nothing.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
)
const run = (cmd, args) =>
  execFileSync(cmd, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
const out = (t = '') => process.stdout.write(`${t}\n`)
process.stdout.on('error', (e) => {
  if (e.code === 'EPIPE') process.exit(0) // output piped into head
  throw e
})

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? undefined : args[i + 1]
}
const JSON_OUT = args.includes('--json')
const PR = flag('pr')
const BASE = flag('base') || 'main'

// ------------------------------------------------------------------------------------------- what changed

// Unified diff (-U0) -> { file: Set(added line numbers) } and, for PRs, the added text per line.
function parseDiff(diff) {
  const changed = {}
  const text = {}
  let file = null
  let line = 0
  for (const l of diff.split('\n')) {
    if (l.startsWith('+++ ')) {
      file = l === '+++ /dev/null' ? null : l.replace(/^\+\+\+ b\//, '')
      if (file) {
        changed[file] ||= new Set()
        text[file] ||= {}
      }
    } else if (l.startsWith('@@')) {
      line = Number(l.match(/\+(\d+)/)[1])
    } else if (file && l.startsWith('+') && !l.startsWith('+++')) {
      changed[file].add(line)
      text[file][line] = l.slice(1)
      line++
    } else if (file && !l.startsWith('-') && !l.startsWith('\\')) {
      line++
    }
  }
  return { changed, text }
}

function target() {
  if (PR) {
    const meta = JSON.parse(
      run('gh', [
        'pr',
        'view',
        PR,
        '--json',
        'number,title,headRefName,headRefOid,url'
      ])
    )
    const { changed, text } = parseDiff(
      run('gh', ['pr', 'diff', PR, '--patch'])
    )
    const head = run('git', ['rev-parse', 'HEAD']).trim()
    return { kind: 'pr', meta, changed, text, local: head === meta.headRefOid }
  }
  const base = run('git', ['merge-base', BASE, 'HEAD']).trim()
  const { changed } = parseDiff(run('git', ['diff', '-U0', base]))
  for (const f of run('git', ['ls-files', '--others', '--exclude-standard'])
    .split('\n')
    .filter(Boolean)) {
    const n = fs
      .readFileSync(path.join(REPO_ROOT, f), 'utf8')
      .split('\n').length
    changed[f] = new Set(Array.from({ length: n }, (_, i) => i + 1))
  }
  const branch = run('git', ['branch', '--show-current']).trim()
  return {
    kind: 'branch',
    meta: { branch, base: BASE, mergeBase: base },
    changed,
    local: true
  }
}

// ----------------------------------------------------------------------------------------- repo rules

const CODE = /^(tests|pages|fixtures|auth|utils|data)\/.*\.(js|mjs|cjs)$/
const UI = /^(tests|pages|fixtures|auth)\//
const SPEC = /^tests\/.*\.spec\.js$/

// Each rule: id (from the reference checklists), severity, what it matches, and where it applies.
const RULES = [
  {
    id: 'PW-01',
    severity: 'blocker',
    msg: 'XPath locator: use getByRole / getByLabel / getByText',
    re: /xpath=|locator\(\s*['"`]\/\//,
    where: UI
  },
  {
    id: 'PW-01',
    severity: 'suggestion',
    msg: 'CSS locator: check whether getByRole / getByLabel / getByText fits',
    re: /\.locator\(\s*['"`](?![\s/])[^'"`]*[.#[>:]/,
    where: UI
  },
  {
    id: 'PW-02',
    severity: 'should-fix',
    msg: '.first() / .nth() / .last() without a comment: scope the locator or say why order is the contract',
    re: /\.(first|nth|last)\(/,
    unless: /\/\/|\/\*/,
    where: UI
  },
  {
    id: 'PW-04',
    severity: 'blocker',
    msg: 'Sleep via setTimeout: wait for the real signal (expect, expect.poll, toPass)',
    re: /new Promise\(\s*\(?\w*\)?\s*=>\s*setTimeout/,
    where: UI
  },
  {
    id: 'PW-05',
    severity: 'should-fix',
    msg: "Swallowed failure (.catch returning nothing/false): a check that can't fail can hide a defect",
    re: /\.catch\(\s*\(\)\s*=>\s*(\{\s*\}|false|null|undefined)\s*\)/,
    where: UI
  },
  {
    id: 'PW-07',
    severity: 'should-fix',
    msg: 'Module-level let in a spec: shared state between tests (comment why, or use a fixture)',
    re: /^let\s/,
    where: SPEC
  },
  {
    id: 'PW-07',
    severity: 'should-fix',
    msg: "Serial mode: state why the tests can't run independently",
    re: /mode:\s*['"]serial['"]/,
    where: SPEC
  },
  {
    id: 'PW-15',
    severity: 'should-fix',
    msg: 'eslint-disable-next-line without a reason: add "-- <why>"',
    re: /eslint-disable(-next)?-line(?![^\n]*--\s*\S)/,
    where: CODE
  },
  {
    id: 'PW-15',
    severity: 'should-fix',
    msg: 'Block eslint-disable: keep it scoped (matching eslint-enable) with the reason beside it; never file-wide',
    re: /\/\*\s*eslint-disable\s/,
    where: CODE
  },
  {
    id: 'ENV',
    severity: 'should-fix',
    msg: 'Hardcoded host: URLs come from utils/journey-entry-point.js',
    re: /['"`]https?:\/\/(?!www\.w3\.org)[^'"`\s]+/,
    where: /^(tests|pages|fixtures|auth)\//
  },
  {
    id: 'DATA',
    severity: 'should-fix',
    msg: 'Org id (UUID) in code: keep test data in data/',
    re: /['"`][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}['"`]/i,
    where: /^(tests|pages|fixtures|auth|utils)\//
  },
  {
    id: 'IN-07',
    severity: 'should-fix',
    msg: 'Email address in code: keep test data in data/ and make sure it is synthetic',
    re: /['"`][\w.+-]+@[\w-]+\.[\w.]+['"`]/,
    where: /^(tests|pages|fixtures|auth|utils)\//
  },
  {
    id: 'IN-05',
    severity: 'blocker',
    msg: 'Possible secret literal: credentials only through requireEnv',
    re: /(password|passwd|secret|token|api[_-]?key|client[_-]?secret)\s*[:=]\s*['"`][^'"`$\s]{6,}['"`]/i,
    where: CODE
  },
  {
    id: 'COV-10',
    severity: 'suggestion',
    msg: 'Test title without an AC or ticket id (AC1, MO-123, E2E-01, TST-01 …)',
    re: /\btest(\.describe)?\(\s*['"]((?!.*\b(AC\d|[A-Z]{2,}-\d+|E2E-|TST-|LOC-)).*)['"]/,
    where: SPEC
  }
]

const lineOf = (f, n, t) => {
  if (t?.text?.[f]?.[n] !== undefined) return t.text[f][n]
  try {
    return (
      fs.readFileSync(path.join(REPO_ROOT, f), 'utf8').split('\n')[n - 1] ?? ''
    )
  } catch {
    return ''
  }
}

function repoFindings(t) {
  const findings = []
  const debt = []
  for (const [file, lines] of Object.entries(t.changed)) {
    if (!CODE.test(file)) continue
    let all
    if (t.local && fs.existsSync(path.join(REPO_ROOT, file)))
      all = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8').split('\n')
    const numbers = all ? all.map((_, i) => i + 1) : [...lines]
    for (const n of numbers) {
      const text = all ? all[n - 1] : lineOf(file, n, t)
      if (/^\s*(\/\/|\*)/.test(text) && !/eslint-disable/.test(text)) continue
      for (const r of RULES) {
        if (!r.where.test(file) || !r.re.test(text)) continue
        // A comment on the line, or the line above, counts as the stated reason.
        const above = all ? all[n - 2] || '' : ''
        if (r.unless && (r.unless.test(text) || /^\s*\/\//.test(above)))
          continue
        const f = {
          id: r.id,
          severity: r.severity,
          file,
          line: n,
          msg: r.msg,
          text: text.trim().slice(0, 140)
        }
        ;(lines.has(n) ? findings : debt).push(f)
      }
    }
  }
  return { findings, debt }
}

// --------------------------------------------------------------------------------------------- eslint

function eslintFindings(t) {
  if (!t.local)
    return {
      findings: [],
      debt: [],
      note: 'eslint skipped: the PR head is not checked out'
    }
  const files = Object.keys(t.changed).filter(
    (f) => /\.(js|mjs|cjs)$/.test(f) && fs.existsSync(path.join(REPO_ROOT, f))
  )
  if (!files.length) return { findings: [], debt: [] }
  let json
  try {
    json = run('npx', [
      'eslint',
      '-f',
      'json',
      '--no-error-on-unmatched-pattern',
      ...files
    ])
  } catch (e) {
    json = e.stdout // eslint exits 1 when it finds problems
  }
  const findings = []
  const debt = []
  for (const r of JSON.parse(json || '[]')) {
    const file = path.relative(REPO_ROOT, r.filePath)
    for (const m of r.messages) {
      const f = {
        id: m.ruleId || 'eslint',
        severity: m.severity === 2 ? 'blocker' : 'should-fix',
        file,
        line: m.line,
        msg: m.message
      }
      ;(t.changed[file]?.has(m.line) ? findings : debt).push(f)
    }
  }
  return { findings, debt }
}

// --------------------------------------------------------------------------------------------- report

const t = target()
const repo = repoFindings(t)
const lint = eslintFindings(t)
const order = { blocker: 0, 'should-fix': 1, suggestion: 2 }
const sort = (a) =>
  a.sort(
    (x, y) =>
      order[x.severity] - order[y.severity] ||
      x.file.localeCompare(y.file) ||
      x.line - y.line
  )
const result = {
  target: t.kind === 'pr' ? { pr: t.meta } : t.meta,
  changedFiles: Object.fromEntries(
    Object.entries(t.changed).map(([f, s]) => [f, s.size])
  ),
  findings: sort([...lint.findings, ...repo.findings]),
  debt: sort([...lint.debt, ...repo.debt]),
  notes: [lint.note].filter(Boolean)
}

if (JSON_OUT) {
  out(JSON.stringify(result, null, 2))
} else {
  const label =
    t.kind === 'pr'
      ? `PR #${t.meta.number} ${t.meta.title}`
      : `${t.meta.branch} vs ${t.meta.base}`
  out(`Scan: ${label}`)
  const code = Object.entries(result.changedFiles).filter(([f]) => CODE.test(f))
  out(
    `Changed files: ${Object.keys(result.changedFiles).length}, of which test code: ${code.length}`
  )
  for (const [f, n] of code) out(`  ${f} (${n} lines)`)
  for (const n of result.notes) out(`Note: ${n}`)
  const table = (rows) => {
    if (!rows.length) return out('  none')
    for (const r of rows)
      out(
        `  ${r.severity.padEnd(10)} ${r.id.padEnd(34)} ${r.file}:${r.line}  ${r.msg}`
      )
  }
  out(`\nOn changed lines (${result.findings.length}):`)
  table(result.findings)
  out(
    `\nExisting debt in the changed files (${result.debt.length}), not blockers:`
  )
  table(result.debt.slice(0, 40))
  if (result.debt.length > 40)
    out(`  … ${result.debt.length - 40} more (--json for all)`)
}
