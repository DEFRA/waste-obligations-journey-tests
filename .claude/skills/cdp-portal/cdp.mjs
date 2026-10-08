#!/usr/bin/env node
// Read-only CDP Portal and CDP API Hub client for the skills in this repo. Only GET requests are made, and no
// credentials are used: the pages read here are visible without signing in (on the Defra network or VPN).
//
//   node .claude/skills/cdp-portal/cdp.mjs versions [service,…] [--env <env>] [--json]   # what's deployed where
//   node .claude/skills/cdp-portal/cdp.mjs build <service> --env <env> [--json]          # one line for evidence
//   node .claude/skills/cdp-portal/cdp.mjs deployed <service> <version> [--json]         # is <version> (or later) in each env?
//   node .claude/skills/cdp-portal/cdp.mjs ticket <JIRA-KEY> [--env <env>] [--prs <file>]    # is each merged PR's first tag deployed?
//   node .claude/skills/cdp-portal/cdp.mjs team [teamId] [--json]                         # a team's services and test suites
//   node .claude/skills/cdp-portal/cdp.mjs suite-runs [suite] [--env <env>] [--limit N] [--json]
//   node .claude/skills/cdp-portal/cdp.mjs api <service> [--env <env>] [--grep <text>] [--json]   # OpenAPI paths from the API Hub
//
// The Portal has no public JSON API, so the pages are parsed. If a page changes shape, a command fails with
// "could not parse" rather than guessing.
//
// Exit codes: 0 ok, 1 request failed or not found, 2 network unreachable (VPN).

import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PR_STATUS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'qa-ticket',
  'pr-status.mjs'
)
const PORTAL = 'https://portal.cdp-int.defra.cloud'
const hub = (env) => `https://cdp-api-hub.${env}.cdp-int.defra.cloud`

// The services this repo tests or depends on: Meet Obligations on CDP, and Re/Ex (PRN/PERN issuing).
const DEFAULT_SERVICES = [
  'waste-obligations-frontend',
  'waste-obligations',
  'waste-obligations-notifications',
  'epr-frontend',
  'epr-backend',
  'epr-re-ex-admin-frontend'
]
const DEFAULT_TEAM = 'epr-meet-obligations'
const DEFAULT_SUITE = 'waste-obligations-journey-tests'

const out = (t) => process.stdout.write(`${t}\n`)
function fail(message, code = 1) {
  process.stderr.write(`cdp-portal: ${message}\n`)
  process.exit(code)
}

async function get(url, { json = false } = {}) {
  let res
  try {
    res = await fetch(url, {
      headers: { Accept: json ? 'application/json' : 'text/html' },
      signal: AbortSignal.timeout(30000)
    })
  } catch (e) {
    const cause = e.cause?.code || e.name
    fail(
      `can't reach ${new URL(url).host} (${cause}). CDP hosts need the Defra VPN: connect and retry.`,
      2
    )
  }
  if (res.status === 404) return null
  if (!res.ok) fail(`GET ${url} returned ${res.status}`)
  return json ? res.json() : res.text()
}

const decode = (s) =>
  s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
const text = (html) =>
  decode(
    html
      .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
  ).trim()
const normEnv = (e) => e.trim().toLowerCase()

// Running services page: one block per environment the service runs in.
async function runningService(service) {
  const html = await get(`${PORTAL}/running-services/${service}`)
  if (html === null) return null
  const main = html.match(/<main[\s\S]*<\/main>/)?.[0] ?? ''
  const blocks = main
    .split(
      /<div class="app-running-service__item app-running-service__item--heading">/
    )
    .slice(1)
  if (!blocks.length)
    fail(`could not parse the running-services page for ${service}`)
  return blocks.map((b) => {
    const t = text(b)
    const env = normEnv(t.replace(/^Environment\s+/, '').split(' ')[0] || '?')
    if (!/releases\/tag\//.test(b))
      return {
        env,
        version: '-',
        status: 'not deployed',
        instances: 0,
        deployed: '',
        by: ''
      }
    const status = b.match(/role="img"\s+aria-label="([^"]+)"/)?.[1] ?? '?'
    return {
      env,
      version: b.match(/releases\/tag\/([^"]+)"/)?.[1] ?? '?',
      status,
      instances: Number(t.match(/Instance Count:\s*(\d+)/)?.[1] ?? NaN),
      deployed: t.match(/Deployed\s+(.+? at \d\d:\d\d)/)?.[1] ?? '',
      by: t.match(/ at \d\d:\d\d by (.+)$/)?.[1]?.trim() ?? ''
    }
  })
}

function args() {
  const a = process.argv.slice(2)
  const flags = {}
  const pos = []
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--json') flags.json = true
    else if (a[i].startsWith('--')) flags[a[i].slice(2)] = a[++i]
    else pos.push(a[i])
  }
  return { cmd: pos.shift(), pos, flags }
}

function table(rows, cols) {
  const w = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length))
  )
  out(cols.map((c, i) => c.padEnd(w[i])).join('  '))
  out(w.map((n) => '-'.repeat(n)).join('  '))
  for (const r of rows)
    out(cols.map((c, i) => String(r[c] ?? '').padEnd(w[i])).join('  '))
}

const semver = (v) =>
  v
    .replace(/^v/, '')
    .split(/[.-]/)
    .map((n) => Number(n) || 0)
function atLeast(v, min) {
  const [a, b] = [semver(v), semver(min)]
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return true
}

async function versions(services, env, json) {
  const results = await Promise.all(
    services.map(async (s) => ({ service: s, envs: await runningService(s) }))
  )
  if (json) return out(JSON.stringify(results, null, 2))
  if (env) {
    table(
      results.map(({ service, envs }) => {
        const e = envs?.find((x) => x.env === env)
        return e
          ? { service, ...e }
          : { service, version: envs ? 'not running' : 'unknown service' }
      }),
      ['service', 'version', 'status', 'deployed', 'by']
    )
    return
  }
  const allEnvs = ['dev', 'test', 'perf-test', 'ext-test', 'prod'].filter((e) =>
    results.some((r) => r.envs?.some((x) => x.env === e))
  )
  table(
    results.map(({ service, envs }) => ({
      service,
      ...Object.fromEntries(
        allEnvs.map((e) => {
          const x = envs?.find((y) => y.env === e)
          return [
            e,
            x && x.version !== '-'
              ? `${x.version}${x.status === 'Running' ? '' : ` (${x.status})`}`
              : '-'
          ]
        })
      )
    })),
    ['service', ...allEnvs]
  )
  out('\n"-" = not running there. Deployed times: add --env <env>.')
}

async function team(id, json) {
  const html = await get(`${PORTAL}/teams/${id}`)
  if (html === null) fail(`no team "${id}" in CDP Portal`)
  const uniq = (re) => [...new Set([...html.matchAll(re)].map((m) => m[1]))]
  const services = uniq(/href="\/services\/([^"/?#]+)"/g)
  const suites = uniq(/href="\/test-suites\/([^"/?#]+)"/g)
  if (json) return out(JSON.stringify({ team: id, services, suites }, null, 2))
  out(`Team ${id}`)
  out(`Services:    ${services.join(', ') || '-'}`)
  out(`Test suites: ${suites.join(', ') || '-'}`)
}

async function suiteRuns(suite, env, limit, json) {
  const html = await get(`${PORTAL}/test-suites/${suite}`)
  if (html === null) fail(`no test suite "${suite}" in CDP Portal`)
  const body = html.match(/<tbody[\s\S]*?<\/tbody>/)?.[0]
  if (!body) fail(`could not parse the runs table for ${suite}`)
  const cell = (row, label) =>
    text(
      row.match(new RegExp(`data-label="${label}">([\\s\\S]*?)</td>`))?.[1] ??
        ''
    )
  let rows = body
    .split(/<tr[^>]*app-entity-table__row/)
    .slice(1)
    .map((r) => ({
      started: cell(r, 'Started'),
      version: cell(r, 'Version'),
      env: normEnv(cell(r, 'Environment')),
      profile: cell(r, 'Profile'),
      status: cell(r, 'Status'),
      result: /app-tick-icon/.test(r)
        ? 'passed'
        : /app-error-icon/.test(r)
          ? 'failed'
          : '-',
      duration: cell(r, 'Duration'),
      runBy: cell(r, 'Run by'),
      logs: decode(r.match(/href="(https:\/\/logs\.[^"]+)"/)?.[1] ?? '')
    }))
  if (env) rows = rows.filter((r) => r.env === env)
  rows = rows.slice(0, limit)
  if (json) return out(JSON.stringify(rows, null, 2))
  table(rows, [
    'started',
    'version',
    'env',
    'profile',
    'status',
    'result',
    'duration',
    'runBy'
  ])
  out('\nLogs links: --json. The HTML report needs a Portal sign-in.')
}

async function api(service, env, grep, json) {
  const spec = await get(`${hub(env)}/hub/internal/${service}/docs`, {
    json: true
  })
  if (spec === null)
    fail(
      `${service} publishes no API docs in ${env} (see ${hub(env)}/hub/internal for the list)`
    )
  const ops = []
  for (const [p, item] of Object.entries(spec.paths ?? {}))
    for (const [method, op] of Object.entries(item))
      if (/^(get|put|post|patch|delete)$/.test(method))
        ops.push({
          method: method.toUpperCase(),
          path: p,
          summary: op.summary || op.description?.split('\n')[0] || ''
        })
  const hits = grep
    ? ops.filter((o) =>
        `${o.path} ${o.summary}`.toLowerCase().includes(grep.toLowerCase())
      )
    : ops
  if (json)
    return out(JSON.stringify({ info: spec.info, operations: hits }, null, 2))
  out(
    `${spec.info?.title ?? service} (${env}), spec ${spec.info?.version ?? '?'}`
  )
  out(`Docs: ${hub(env)}/hub/internal/${service}/view/redoc\n`)
  table(hits, ['method', 'path', 'summary'])
}

// Does each CDP environment run a build that contains every merged PR for the ticket? A PR's change is in an
// environment when the deployed version is the PR's first release tag or later (versions only go up on CDP).
async function ticket(key, env, prsFile, json) {
  const prs = JSON.parse(
    prsFile
      ? (await import('node:fs')).readFileSync(prsFile, 'utf8')
      : execFileSync('node', [PR_STATUS, key, '--json'], { encoding: 'utf8' })
  ).filter((p) => p.linked)
  if (!prs.length)
    fail(
      `no linked pull requests for ${key} (run pr-status.mjs to see mentions)`
    )
  const rows = []
  for (const p of prs) {
    const service = p.repo.split('/')[1]
    const envs = await runningService(service)
    const base = {
      service,
      pr: `#${p.number}`,
      state: p.state,
      firstTag: p.firstTag ?? '-'
    }
    if (!envs) {
      rows.push({
        ...base,
        env: '-',
        deployed: '-',
        verdict: 'not a CDP service: check its own release'
      })
      continue
    }
    for (const e of envs.filter((x) => !env || x.env === env)) {
      let verdict
      if (p.state !== 'MERGED') verdict = `not merged (${p.state})`
      else if (!p.firstTag) verdict = 'merged, no release tag yet'
      else if (e.version === '-') verdict = 'not deployed'
      else verdict = atLeast(e.version, p.firstTag) ? 'CONTAINS' : 'MISSING'
      rows.push({ ...base, env: e.env, deployed: e.version, verdict })
    }
  }
  const envNames = [...new Set(rows.map((r) => r.env).filter((e) => e !== '-'))]
  const ready = Object.fromEntries(
    envNames.map((e) => [
      e,
      prs.every((p) => {
        const r = rows.filter(
          (x) => x.pr === `#${p.number}` && x.service === p.repo.split('/')[1]
        )
        return (
          r.every((x) => x.env === '-') ||
          r.some((x) => x.env === e && x.verdict === 'CONTAINS')
        )
      })
    ])
  )
  if (json) return out(JSON.stringify({ ticket: key, rows, ready }, null, 2))
  table(rows, [
    'service',
    'pr',
    'state',
    'firstTag',
    'env',
    'deployed',
    'verdict'
  ])
  out('')
  for (const [e, ok] of Object.entries(ready))
    out(
      `${e}: ${ok ? 'contains every linked CDP PR, OK to test' : "does NOT contain every linked PR, don't test here yet"}`
    )
}

const { cmd, pos, flags } = args()
const env = flags.env && normEnv(flags.env)
switch (cmd) {
  case 'versions':
    await versions(
      pos[0] ? pos[0].split(',') : DEFAULT_SERVICES,
      env,
      flags.json
    )
    break
  case 'build': {
    if (!pos[0] || !env) fail('usage: build <service> --env <env>')
    const e = (await runningService(pos[0]))?.find(
      (x) => x.env === env && x.version !== '-'
    )
    if (!e) fail(`${pos[0]} is not running in ${env}`)
    const line = {
      build: `${pos[0]} ${e.version}`,
      source: `CDP Portal, ${env}, deployed ${e.deployed}${e.by ? ` by ${e.by}` : ''}, read ${new Date().toISOString().slice(0, 10)}`
    }
    out(flags.json ? JSON.stringify(line) : `${line.build}\n${line.source}`)
    break
  }
  case 'deployed': {
    const [service, min] = pos
    if (!service || !min) fail('usage: deployed <service> <version>')
    const envs = await runningService(service)
    if (!envs) fail(`no running service "${service}" in CDP Portal`)
    const rows = envs.map((e) => ({
      env: e.env,
      version: e.version,
      [`has ${min}`]:
        e.version !== '-' && atLeast(e.version, min) ? 'yes' : 'no'
    }))
    if (flags.json) out(JSON.stringify(rows, null, 2))
    else table(rows, ['env', 'version', `has ${min}`])
    break
  }
  case 'ticket':
    if (!pos[0])
      fail('usage: ticket <JIRA-KEY> [--env <env>] [--prs <pr-status.json>]')
    await ticket(pos[0].toUpperCase(), env, flags.prs, flags.json)
    break
  case 'team':
    await team(pos[0] || DEFAULT_TEAM, flags.json)
    break
  case 'suite-runs':
    await suiteRuns(
      pos[0] || DEFAULT_SUITE,
      env,
      Number(flags.limit) || 10,
      flags.json
    )
    break
  case 'api':
    if (!pos[0]) fail('usage: api <service> [--env <env>] [--grep <text>]')
    await api(pos[0], env || 'test', flags.grep, flags.json)
    break
  default:
    fail(
      'usage: cdp.mjs versions|build|deployed|team|suite-runs|api … (see the header of this file)'
    )
}
