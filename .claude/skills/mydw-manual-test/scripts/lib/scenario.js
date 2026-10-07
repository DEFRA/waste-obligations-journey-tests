'use strict'

// Switches the time-shift scenario: rewrites TIMESHIFT_DATETIME in epr-local-environment/.env and recreates only
// the two shifted services (epr-packaging-frontend, b2c-mock) from their existing local images — no pull, no build.

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { LOCAL_ENV_ROOT, SCENARIOS, CONTAINERS } = require('../config')

const ENV_FILE = path.join(LOCAL_ENV_ROOT, '.env')
const COMPOSE = [
  'compose',
  '-f',
  'compose.yml',
  '-f',
  'compose.b2cmock.yml',
  '-f',
  'compose.timeshift.yml',
  '--profile',
  'packaging',
  '--profile',
  'timeshift-packaging'
]

function readTimeshift() {
  const m = fs
    .readFileSync(ENV_FILE, 'utf8')
    .match(/^TIMESHIFT_DATETIME=(.*)$/m)
  return m ? m[1].trim() : null
}

function writeTimeshift(value) {
  const text = fs.readFileSync(ENV_FILE, 'utf8')
  const next = /^TIMESHIFT_DATETIME=.*$/m.test(text)
    ? text.replace(/^TIMESHIFT_DATETIME=.*$/m, `TIMESHIFT_DATETIME=${value}`)
    : `TIMESHIFT_DATETIME=${value}\n${text}`
  fs.writeFileSync(ENV_FILE, next)
}

function waitHealthy(name, timeoutMs = 180000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const state = execFileSync(
      'docker',
      [
        'inspect',
        name,
        '--format',
        '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}'
      ],
      { encoding: 'utf8' }
    ).trim()
    if (state === 'healthy') return state
    execFileSync('sleep', ['3'])
  }
  throw new Error(`${name} not healthy after ${timeoutMs / 1000}s`)
}

// id: S1|S2|S3 or a literal 'YYYY-MM-DD hh:mm:ss'. S0 (real clock) needs the stack started without the timeshift
// overlay, which is a full restart — not done here.
function switchTo(id) {
  const value = SCENARIOS[id] ? SCENARIOS[id].timeshift : id
  if (!value)
    throw new Error(
      'S0 (real clock) needs the stack restarted without compose.timeshift.yml — see reference/scenarios.md'
    )
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value))
    throw new Error(
      `Bad scenario/datetime "${id}" (use S1|S2|S3 or 'YYYY-MM-DD hh:mm:ss')`
    )
  const previous = readTimeshift()
  writeTimeshift(value)
  execFileSync(
    'docker',
    [
      ...COMPOSE,
      'up',
      '-d',
      '--no-deps',
      '--no-build',
      '--pull',
      'never',
      '--force-recreate',
      'epr-packaging-frontend',
      'b2c-mock'
    ],
    { cwd: LOCAL_ENV_ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
  )
  waitHealthy('epr-local-environment-b2c-mock-1')
  waitHealthy(CONTAINERS.frontend)
  return { previous, now: value }
}

module.exports = { switchTo, readTimeshift }
