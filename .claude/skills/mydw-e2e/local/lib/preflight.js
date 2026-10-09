'use strict'

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const {
  CONTAINERS,
  SCENARIOS,
  LOCAL_ENV_ROOT,
  FRONTEND_BASE
} = require('../config')

function docker(args) {
  try {
    return execFileSync('docker', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim()
  } catch (err) {
    return null
  }
}

function containerState(name) {
  const out = docker([
    'inspect',
    name,
    '--format',
    '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}'
  ])
  return out || 'missing'
}

// Identifies the code under test: image name, short image id and creation time of the running frontend container.
function frontendImage() {
  const img = docker([
    'inspect',
    CONTAINERS.frontend,
    '--format',
    '{{.Config.Image}} {{.Image}}'
  ])
  if (!img) return 'unknown'
  const [name, id] = img.split(' ')
  const created =
    docker(['image', 'inspect', id, '--format', '{{.Created}}']) || ''
  return `${name} (${id.replace('sha256:', '').slice(0, 12)}, built ${created.slice(0, 19)})`
}

function frontendEnv() {
  const out =
    docker([
      'inspect',
      CONTAINERS.frontend,
      '--format',
      '{{range .Config.Env}}{{println .}}{{end}}'
    ]) || ''
  const env = {}
  for (const line of out.split('\n')) {
    const i = line.indexOf('=')
    if (i > 0) env[line.slice(0, i)] = line.slice(i + 1)
  }
  return env
}

// compose.timeshift.yml runs: faketime --exclude-monotonic -f '<TIMESHIFT_DATETIME>' dotnet ...
// Without a leading '@' faketime freezes the clock at that instant. Container TZ is UTC.
function frontendClock() {
  const cmd =
    docker([
      'inspect',
      CONTAINERS.frontend,
      '--format',
      '{{json .Config.Cmd}}'
    ]) || ''
  const m =
    cmd.match(/faketime[^']*-f\s*'([^']+)'/) ||
    cmd.match(/Setting fake time to ([0-9-]+ [0-9:]+)/)
  if (!m) return { shifted: false, raw: null, now: new Date(), frozen: false }
  const raw = m[1].trim()
  const frozen =
    !raw.startsWith('@') && !raw.startsWith('+') && !raw.startsWith('-')
  const now = new Date(`${raw.replace(/^@/, '').replace(' ', 'T')}Z`)
  return { shifted: true, raw, now, frozen }
}

function scenarioFor(clock) {
  if (!clock.shifted) return 'S0'
  const hit = Object.entries(SCENARIOS).find(
    ([, s]) => s.timeshift === clock.raw.replace(/^@/, '')
  )
  return hit ? hit[0] : 'custom'
}

async function frontendReachable() {
  try {
    const res = await fetch(`${FRONTEND_BASE}/report-data/admin/health`, {
      redirect: 'manual'
    })
    return res.status
  } catch (err) {
    return `unreachable (${err.cause ? err.cause.code : err.message})`
  }
}

async function run() {
  const env = frontendEnv()
  const clock = frontendClock()
  const dotEnv = path.join(LOCAL_ENV_ROOT, '.env')
  const dotEnvShift = fs.existsSync(dotEnv)
    ? (fs.readFileSync(dotEnv, 'utf8').match(/^TIMESHIFT_DATETIME=(.*)$/m) ||
        [])[1] || null
    : null
  const containers = {}
  for (const name of [
    CONTAINERS.frontend,
    CONTAINERS.sql,
    'epr-local-environment-epr-prn-common-backend-1',
    'epr-local-environment-epr-pom-api-web-1',
    'epr-local-environment-b2c-mock-1',
    'epr-local-environment-waste-obligations-1'
  ]) {
    containers[name.replace('epr-local-environment-', '').replace(/-1$/, '')] =
      containerState(name)
  }
  return {
    containers,
    flags: {
      ShowMultiYearObligations:
        env.FeatureManagement__ShowMultiYearObligations ?? '(unset → false)',
      ShowDecemberWaste:
        env.FeatureManagement__ShowDecemberWaste ?? '(unset → false)',
      ShowPrn: env.FeatureManagement__ShowPrn ?? '(unset)'
    },
    b2cInstance: env.AzureADB2C__Instance || null,
    frontendImage: frontendImage(),
    clock: {
      shifted: clock.shifted,
      timeshift: clock.raw,
      frozen: clock.frozen,
      now: clock.now.toISOString()
    },
    dotEnvTimeshift: dotEnvShift,
    scenario: scenarioFor(clock),
    frontendHealth: await frontendReachable()
  }
}

function flagOn(value) {
  return String(value).toLowerCase() === 'true'
}

module.exports = {
  run,
  frontendClock,
  scenarioFor,
  frontendEnv,
  frontendImage,
  flagOn
}
