'use strict'

// LOCAL stack controls for mydw-e2e: the time-shifted clock, PRN data snapshot/restore and the MYDW-* seed rows.
// Run from the repo root:
//
//   node .claude/skills/mydw-e2e/local/stack.js --preflight            # containers, flags, frozen clock, scenario
//   node .claude/skills/mydw-e2e/local/stack.js --scenario S1|S2|S3    # switch the clock, re-seed the MYDW-* rows
//   node .claude/skills/mydw-e2e/local/stack.js --snapshot [--force]   # baseline PRN data (freshly seeded stack only)
//   node .claude/skills/mydw-e2e/local/stack.js --restore              # back to the baseline and the seeded state
//   node .claude/skills/mydw-e2e/local/stack.js --data-status          # drift from the baseline
//   node .claude/skills/mydw-e2e/local/stack.js --seed [DRP|CS|all] [--dec-year Y]
//   node .claude/skills/mydw-e2e/local/stack.js --unseed
//   node .claude/skills/mydw-e2e/local/stack.js --rules [--org-type DRP|CS]   # expected behaviour per note now
//
// State (snapshot, seeded rows, flag-off overlays) is in .claude/skills/mydw-e2e/.state/, which is gitignored.

const { userFor } = require('./config')
const preflight = require('./lib/preflight')
const rules = require('./lib/rules')
const db = require('./lib/db')

const info = (t) => process.stdout.write(`${t}\n`)
const out = (o) => info(JSON.stringify(o, null, 2))

function parseArgs(argv) {
  const flags = new Set()
  const opts = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      opts[key] = next
      i++
    } else flags.add(key)
  }
  return { flags, opts }
}

function rulesTable(opts) {
  const orgType = opts['org-type'] || 'DRP'
  const { orgExternalId } = userFor(orgType, 'AP')
  const clock = preflight.frontendClock()
  info(
    `Expected behaviour for ${orgType} at frontend clock ${clock.now.toISOString()} (C=${rules.complianceYear(clock.now)}; year options ${rules.yearOptions(clock.now).join(', ')}):`
  )
  for (const p of db.listPrns(orgExternalId))
    info(`  ${rules.describe(p, clock.now)}`)
}

// December Waste PRNs/PERNs issued in the December of the frontend's clock, and standard PERNs for the current
// compliance year, owned by these tools (MYDW-* numbers).
function seedOrgs(opts) {
  const which = (opts.seed || opts['org-type'] || 'all').toUpperCase()
  const clock = preflight.frontendClock()
  const results = {}
  for (const orgType of which === 'ALL' ? ['DRP', 'CS'] : [which]) {
    const { orgExternalId } = userFor(orgType, 'AP')
    results[orgType] = db.seed({
      orgExternalId,
      tag: orgType === 'DRP' ? 'DP' : 'CS',
      now: clock.now,
      complianceYear: rules.complianceYear(clock.now),
      decemberYear: opts['dec-year'] ? Number(opts['dec-year']) : null
    })
  }
  out({ frontendClock: clock.now.toISOString(), ...results })
  info('Expected behaviour of the seeded rows at this clock:')
  for (const orgType of Object.keys(results)) {
    const { orgExternalId } = userFor(orgType, 'AP')
    for (const p of db
      .listPrns(orgExternalId)
      .filter((x) => x.PrnNumber.startsWith(db.SEED_PREFIX)))
      info(`  ${rules.describe(p, clock.now)}`)
  }
}

async function main() {
  const { flags, opts } = parseArgs(process.argv.slice(2))
  if (flags.has('preflight')) return out(await preflight.run())
  if (flags.has('snapshot'))
    return out(db.snapshot({ force: flags.has('force') }))
  if (flags.has('restore')) return out(db.restore())
  if (flags.has('data-status')) return out(db.status())
  if (flags.has('rules')) return rulesTable(opts)
  if (opts.scenario) {
    // Switch the clock, then re-seed the MYDW-* rows so their December issue dates follow it.
    const r = require('./lib/scenario').switchTo(opts.scenario)
    out({ timeshift: r, preflight: await preflight.run() })
    if (db.readSeeded().prns.length && !flags.has('no-reseed'))
      seedOrgs({ ...opts, seed: 'all' })
    return undefined
  }
  if (flags.has('seed') || opts.seed) return seedOrgs(opts)
  if (flags.has('unseed')) return out(db.unseed())
  process.stderr.write('usage: see the header of stack.js\n')
  process.exit(1)
}

main().catch((err) => {
  process.stderr.write(`${(err && err.stack) || err}\n`)
  process.exit(1)
})
