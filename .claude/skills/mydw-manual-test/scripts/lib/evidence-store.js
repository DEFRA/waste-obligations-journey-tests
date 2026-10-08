'use strict'

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const { REPO_ROOT, evidenceRoot, timestamp } = require('../config')

// Screenshot file names carry the step outcome of the automation ('ok' / 'error'); the tester's verdict lives in run.json.

function safeSlug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function commitSha() {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .toString()
      .trim()
  } catch (_) {
    return 'unknown'
  }
}

// All cells of one testing session share a run folder. MYDW_RUN_TS pins it; otherwise the latest folder from the
// last 12 hours is reused so finalize picks up every cell, and a new one is started after that.
function runTimestamp(ticket) {
  if (process.env.MYDW_RUN_TS) return process.env.MYDW_RUN_TS
  const latest = findLatestTicketDir(ticket)
  if (latest) {
    const name = path.basename(latest)
    const d = new Date(
      `${name.slice(0, 4)}-${name.slice(4, 6)}-${name.slice(6, 8)}T${name.slice(9, 11)}:${name.slice(11, 13)}:${name.slice(13, 15)}`
    )
    if (Date.now() - d.getTime() < 12 * 3600 * 1000) return name
  }
  return timestamp()
}

function newRun({ ticket, journey, cellSuffix }) {
  const ts = runTimestamp(ticket)
  let cellName = `${journey}-${cellSuffix}`
  let cellDir = path.join(evidenceRoot(ticket), ts, cellName)
  for (let n = 2; fs.existsSync(cellDir); n++)
    cellDir = path.join(evidenceRoot(ticket), ts, `${cellName}-r${n}`)
  cellName = path.basename(cellDir)
  fs.mkdirSync(cellDir, { recursive: true })
  return { ticket, journey, ts, cellName, cellDir }
}

function findLatestTicketDir(ticket) {
  const root = evidenceRoot(ticket)
  if (!fs.existsSync(root)) return null
  const entries = fs
    .readdirSync(root)
    .filter((n) => /^\d{8}-\d{6}$/.test(n))
    .sort()
  if (!entries.length) return null
  return path.join(root, entries[entries.length - 1])
}

function listCells(ticketRunDir) {
  return fs
    .readdirSync(ticketRunDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(ticketRunDir, d.name))
}

async function captureStep({ page, cellDir, index, stepId, title, verdict }) {
  const slug = safeSlug(title)
  const filename = `${String(index).padStart(2, '0')}-${stepId}-${slug}-${verdict.toLowerCase()}.png`
  const filepath = path.join(cellDir, filename)
  try {
    await page.screenshot({ path: filepath, fullPage: true })
  } catch (err) {
    fs.writeFileSync(
      filepath.replace(/\.png$/, '.error.txt'),
      String((err && err.message) || err)
    )
    return null
  }
  return filepath
}

function writeRunJson(cellDir, meta) {
  fs.writeFileSync(
    path.join(cellDir, 'run.json'),
    JSON.stringify(meta, null, 2)
  )
}

function readRunJson(cellDir) {
  const p = path.join(cellDir, 'run.json')
  if (!fs.existsSync(p)) return null
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

module.exports = {
  safeSlug,
  commitSha,
  newRun,
  findLatestTicketDir,
  listCells,
  captureStep,
  writeRunJson,
  readRunJson
}
