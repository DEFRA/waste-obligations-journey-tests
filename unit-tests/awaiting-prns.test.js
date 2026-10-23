import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const MODULE = fileURLToPath(
  new URL('../utils/awaiting-prns.js', import.meta.url)
)

// The helpers read ENVIRONMENT and IS_CI when they load, so each case runs in
// its own process. PATH is empty, so a seed or remove that reached docker would
// fail to start it and exit non-zero.
function runHelper(env, call) {
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import(${JSON.stringify(MODULE)}).then(async (m) => { ${call} })`
    ],
    { env: { ...env, PATH: '' }, encoding: 'utf8' }
  )
}

test('seeding does nothing outside the local stack', () => {
  const result = runHelper({ ENVIRONMENT: 'tst' }, "m.seedAwaitingPrns('dp')")

  assert.equal(result.status, 0, result.stderr)
})

test('removing does nothing outside the local stack', () => {
  const result = runHelper(
    { ENVIRONMENT: 'dev' },
    "await m.resetAwaitingPrns('dp', null)"
  )

  assert.equal(result.status, 0, result.stderr)
})
