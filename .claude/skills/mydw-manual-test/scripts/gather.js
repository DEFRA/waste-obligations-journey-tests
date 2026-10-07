#!/usr/bin/env node
'use strict'

process.env.NODE_TLS_REJECT_UNAUTHORIZED =
  process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0' // local self-signed certs
process.removeAllListeners('warning')

const path = require('path')
const {
  parseArgs,
  requireOpt,
  userFor,
  evidenceRoot,
  SCENARIOS,
  HYPOTHESES
} = require('./config')
const { openBrowser } = require('./lib/session')
const {
  newRun,
  findLatestTicketDir,
  listCells,
  captureStep,
  writeRunJson,
  readRunJson
} = require('./lib/evidence-store')
const promptLib = require('./lib/prompt')
const docxBuilder = require('./lib/docx-builder')
const preflight = require('./lib/preflight')
const rules = require('./lib/rules')
const db = require('./lib/db')

const JOURNEYS = {
  'MYDW-01': require('./steps/mydw-01-tile-year-selection'),
  'MYDW-02': require('./steps/mydw-02-obligations-by-year'),
  'MYDW-03': require('./steps/mydw-03-accept-reject-list'),
  'MYDW-04': require('./steps/mydw-04-dw-accept-year-choice'),
  'MYDW-05': require('./steps/mydw-05-standard-accept'),
  'MYDW-06': require('./steps/mydw-06-bulk-accept'),
  'MYDW-07': require('./steps/mydw-07-reject'),
  'MYDW-08': require('./steps/mydw-08-time-window-rules'),
  'MYDW-09': require('./steps/mydw-09-flags-off'),
  'MYDW-10': require('./steps/mydw-10-welsh'),
  'MYDW-11': require('./steps/mydw-11-access-roles'),
  'MYDW-R': require('./steps/mydw-r-research-walkthrough')
}

async function runCell(opts) {
  const ticket = opts.ticket || 'MYDW-ADHOC'
  const journey = requireOpt(opts, 'journey')
  const orgType = opts['org-type'] || 'DRP'
  const role = opts.role || 'AP'
  const lang = opts.lang || 'en'
  const dryRun = opts.__flags.has('dry-run')
  const headed = !opts.__flags.has('headless')

  const journeyModule = JOURNEYS[journey]
  if (!journeyModule)
    throw new Error(
      `Unknown journey ${journey} (known: ${Object.keys(JOURNEYS).join(', ')})`
    )

  const pf = await preflight.run()
  const clock = preflight.frontendClock()
  const now = clock.now
  const c = rules.complianceYear(now)
  const user = userFor(orgType, role)
  const ctx = {
    ticket,
    journey,
    orgType,
    role,
    lang,
    dryRun,
    user,
    now,
    complianceYear: c,
    scenario: pf.scenario,
    flags: pf.flags,
    year: opts.year ? Number(opts.year) : c,
    acceptYear: opts['accept-year'] ? Number(opts['accept-year']) : null,
    prnNumber: opts.prn || null,
    noteType: (opts.note || 'PRN').toUpperCase(),
    preconditions: [],
    db,
    rules
  }

  if (typeof journeyModule.applies === 'function') {
    const why = journeyModule.applies(ctx)
    if (why !== true) {
      promptLib.info(
        `Journey ${journey} does not apply: ${why}. Skipping cell.`
      )
      return
    }
  }

  const cellSuffix = [
    orgType,
    role,
    pf.scenario,
    lang === 'cy' ? 'CY' : null,
    ctx.noteType === 'PERN' && !opts.prn ? 'PERN' : null,
    opts.prn ? opts.prn : null
  ]
    .filter(Boolean)
    .join('-')
  const run = newRun({ ticket, journey, cellSuffix })
  ctx.cellDir = run.cellDir

  ctx.preconditions.push(
    `Scenario ${pf.scenario}: ${SCENARIOS[pf.scenario] ? SCENARIOS[pf.scenario].label : 'custom time shift'} — frontend clock ${clock.shifted ? `${clock.raw} (${clock.frozen ? 'frozen' : 'ticking'})` : 'real'}; compliance year ${c}.`,
    `Flags: ShowMultiYearObligations=${pf.flags.ShowMultiYearObligations}, ShowDecemberWaste=${pf.flags.ShowDecemberWaste}.`,
    `Signed in via mock B2C as ${user.userName} (${user.roleLabel}) of ${user.orgName}.`
  )
  if (typeof journeyModule.preconditionsSummary === 'function')
    ctx.preconditions.push(...journeyModule.preconditionsSummary(ctx))

  const startedAt = new Date().toISOString()
  promptLib.info(
    `=== ${journey} ${journeyModule.title} — ${orgType}/${role} — scenario ${pf.scenario} (C=${c})${dryRun ? ' [dry-run: no accept/reject commits]' : ''} ===`
  )
  for (const p of ctx.preconditions) promptLib.info(`  • ${p}`)

  const { browser, context, page, baseURL } = await openBrowser({ headed })
  ctx.context = context
  const reader = promptLib.makeReader()
  const stepResults = []

  try {
    const steps =
      typeof journeyModule.buildSteps === 'function'
        ? await journeyModule.buildSteps(ctx)
        : journeyModule.steps
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      let actionError = null
      let observed = ''
      try {
        const r = await step.action({ page, ctx, cellDir: run.cellDir })
        if (typeof r === 'string') observed = r
      } catch (err) {
        actionError =
          err && err.message ? err.message.split('\n')[0] : String(err)
      }

      const screenshotPath = await captureStep({
        page,
        cellDir: run.cellDir,
        index: i + 1,
        stepId: step.id,
        title: step.title,
        verdict: actionError ? 'error' : 'ok'
      })

      const expectedText =
        typeof step.expected === 'function'
          ? step.expected({ ctx })
          : step.expected
      const lines = [expectedText]
      if (step.hypothesis)
        lines.push(
          `[${step.hypothesis}] ${HYPOTHESES[step.hypothesis] || ''}${step.observe ? ` Observe: ${step.observe}` : ''}`
        )
      if (observed) lines.push(`Observed by automation: ${observed}`)
      if (actionError) lines.push(`Automation error: ${actionError}`)

      promptLib.frame({
        id: step.id,
        title: step.title,
        journey,
        expected: `${lines.join('\n')}\nReply PASS / FAIL <reason> / NOTE <text> / SKIP.`
      })

      const raw = await reader.next()
      const { verdict, note } = promptLib.parseReply(raw)

      stepResults.push({
        id: step.id,
        title: step.title,
        action: step.title,
        expected: expectedText,
        hypothesis: step.hypothesis || null,
        observed,
        verdict,
        note: actionError
          ? `${note ? `${note} | ` : ''}Automation error: ${actionError}`
          : note,
        screenshotPath,
        url: page.url(),
        capturedAt: new Date().toISOString()
      })
    }
  } finally {
    reader.close()
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }

  const meta = {
    ticket,
    testCaseId: `${ticket}-${journey}-${cellSuffix}`,
    journey,
    journeyTitle: journeyModule.title,
    orgType,
    orgTypeLabel: user.label,
    orgName: user.orgName,
    role,
    roleLabel: user.roleLabel,
    userName: user.userName,
    scenario: pf.scenario,
    scenarioLabel: SCENARIOS[pf.scenario]
      ? SCENARIOS[pf.scenario].label
      : 'custom',
    frontendClock: clock.shifted ? clock.raw : 'real clock',
    complianceYear: c,
    flags: pf.flags,
    lang,
    env: 'local',
    baseUrl: baseURL,
    executor: process.env.MYDW_EXECUTOR || process.env.USER || '',
    startedAt,
    finishedAt: new Date().toISOString(),
    frontendImage: pf.frontendImage,
    browser: `chromium (${headed ? 'headed' : 'headless'})`,
    dryRun,
    preconditions: ctx.preconditions,
    steps: stepResults
  }
  writeRunJson(run.cellDir, meta)
  promptLib.info(`Cell finished: ${run.cellDir}`)
}

function totalsFor(steps) {
  const t = { total: steps.length, pass: 0, fail: 0, skip: 0 }
  for (const s of steps) {
    if (s.verdict === 'PASS') t.pass += 1
    else if (s.verdict === 'FAIL') t.fail += 1
    else if (s.verdict === 'SKIP') t.skip += 1
  }
  return t
}

async function finalize(opts) {
  const ticket = opts.ticket || 'MYDW-ADHOC'
  const ticketRunDir = opts.dir || findLatestTicketDir(ticket)
  if (!ticketRunDir)
    throw new Error(
      `No evidence dir for ticket ${ticket} under ${evidenceRoot(ticket)}`
    )
  const summaries = []
  for (const cellDir of listCells(ticketRunDir)) {
    const meta = readRunJson(cellDir)
    if (!meta) continue
    const totals = totalsFor(meta.steps || [])
    const doc = docxBuilder.buildCellDocument(meta, meta.steps || [])
    const outDocx = path.join(cellDir, 'evidence.docx')
    await docxBuilder.saveDocument(doc, outDocx)
    summaries.push({
      cellName: path.basename(cellDir),
      journey: meta.journey,
      orgType: meta.orgType,
      role: meta.role,
      scenario: meta.scenario,
      lang: meta.lang || 'en',
      totals,
      overall: totals.fail > 0 ? 'FAIL' : 'PASS',
      relDocxPath: `${path.basename(cellDir)}/evidence.docx`,
      hypothesisNotes: (meta.steps || [])
        .filter((s) => s.hypothesis && s.note)
        .map((s) => ({ h: s.hypothesis, step: s.title, note: s.note }))
    })
    promptLib.info(`Wrote ${outDocx}`)
  }
  const summaryOut = path.join(ticketRunDir, 'SUMMARY.docx')
  await docxBuilder.saveDocument(
    docxBuilder.summaryDocument({ ticket, cells: summaries }),
    summaryOut
  )
  promptLib.info(`Wrote ${summaryOut}`)
  promptLib.info(`Evidence root: ${ticketRunDir}`)
}

async function rulesTable(opts) {
  const orgType = opts['org-type'] || 'DRP'
  const { orgExternalId } = userFor(orgType, 'AP')
  const clock = preflight.frontendClock()
  promptLib.info(
    `Expected behaviour for ${orgType} at frontend clock ${clock.now.toISOString()} (C=${rules.complianceYear(clock.now)}; year options ${rules.yearOptions(clock.now).join(', ')}):`
  )
  for (const p of db.listPrns(orgExternalId))
    promptLib.info(`  ${rules.describe(p, clock.now)}`)
}

// Seeds skill-owned December Waste PRNs/PERNs (issued in the December of the frontend's time-shifted clock) and
// standard PERNs for the current compliance year. --seed [DRP|CS|all] (default all) [--dec-year Y].
function seedOrgs(opts, out) {
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
  promptLib.info('Expected behaviour of the seeded rows at this clock:')
  for (const orgType of Object.keys(results)) {
    const { orgExternalId } = userFor(orgType, 'AP')
    for (const p of db
      .listPrns(orgExternalId)
      .filter((x) => x.PrnNumber.startsWith(db.SEED_PREFIX)))
      promptLib.info(`  ${rules.describe(p, clock.now)}`)
  }
}

async function main() {
  const { flags, opts } = parseArgs(process.argv.slice(2))
  opts.__flags = flags
  const out = (o) => promptLib.info(JSON.stringify(o, null, 2))

  if (flags.has('finalize')) return finalize(opts)
  if (flags.has('preflight')) return out(await preflight.run())
  if (flags.has('snapshot'))
    return out(db.snapshot({ force: flags.has('force') }))
  if (flags.has('restore')) return out(db.restore())
  if (flags.has('data-status')) return out(db.status())
  if (flags.has('rules')) return rulesTable(opts)
  if (opts['seed-flash'])
    return out(
      db.setIssueDate(opts['seed-flash'], opts.date || '2026-12-10T09:00:00')
    )
  if (opts.scenario) {
    // Switch clock, then re-seed the MYDW-* rows so their December issue dates follow the new clock.
    const r = require('./lib/scenario').switchTo(opts.scenario)
    out({ timeshift: r, preflight: await preflight.run() })
    if (db.readSeeded().prns.length && !flags.has('no-reseed'))
      return seedOrgs({ ...opts, seed: 'all' }, out)
    return undefined
  }
  if (flags.has('seed') || opts.seed) return seedOrgs(opts, out)
  if (flags.has('unseed')) return out(db.unseed())
  return runCell(opts)
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${(err && err.stack) || err}\n`)
    process.exit(1)
  })
}

module.exports = { main, runCell, finalize, JOURNEYS }
