#!/usr/bin/env node
// Installs the parts of epr-qa-control-plane this repo has chosen, at a pinned commit, without joining it.
//
//   node .claude/install-control-plane.mjs                 # install what .claude/control-plane.json lists
//   node .claude/install-control-plane.mjs list            # every skill at the pinned commit: needs, installed?
//   node .claude/install-control-plane.mjs add <skill…>    # add to the manifest, then install
//   node .claude/install-control-plane.mjs remove <skill…> # remove from the manifest, then install
//   node .claude/install-control-plane.mjs update [<ref>]  # move the pin (default origin/main), show what changed
//   node .claude/install-control-plane.mjs check           # offline: say if the install is missing or stale
//
// The manifest (.claude/control-plane.json, committed) pins one commit and names the skills and extra paths.
// What's installed is gitignored, like node_modules:
//   .claude/skills/cp-<skill>/   each skill, renamed cp-<skill> so it can't replace one of ours
//   .claude/control-plane/       the control-plane files those skills use (scripts/, docs/ …), same layout
// Paths in installed text files are rewritten to those locations. Installed files are overwritten on every
// install: change them in the control plane, or copy a skill into .claude/skills/ under its own name and adapt it.
//
// Source: a local clone (CONTROL_PLANE_PATH, default ../epr-qa-control-plane). Files are read with
// `git archive <commit>`, so the clone's branch and working tree don't matter. The repo is private, so there is
// no download fallback; a missing commit is fetched with the user's own git credentials.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const MANIFEST = path.join(REPO_ROOT, '.claude', 'control-plane.json')
const SKILLS_DIR = path.join(REPO_ROOT, '.claude', 'skills')
const DEPS_DIR = path.join(REPO_ROOT, '.claude', 'control-plane')
const DEPS_REL = '.claude/control-plane'
const STAMP = path.join(DEPS_DIR, '.installed.json')
const PREFIX = 'cp-'
// Top-level folders of the control plane that skills refer to by repo-relative path.
const ROOTS = ['scripts', 'docs', 'tools', 'wiki']

const out = (t = '') => process.stdout.write(`${t}\n`)
function fail(message, code = 1) {
  process.stderr.write(`install-control-plane: ${message}\n`)
  process.exit(code)
}

const readManifest = () => JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
const writeManifest = (m) =>
  fs.writeFileSync(MANIFEST, `${JSON.stringify(m, null, 2)}\n`)

function source() {
  const src = path.resolve(
    REPO_ROOT,
    process.env.CONTROL_PLANE_PATH || '../epr-qa-control-plane'
  )
  if (!fs.existsSync(path.join(src, '.git')))
    fail(
      `no control-plane clone at ${src}. Clone DEFRA/epr-qa-control-plane next to this repo, or set CONTROL_PLANE_PATH.`,
      2
    )
  return src
}
const git = (src, args, opts = {}) =>
  execFileSync('git', ['-C', src, ...args], { encoding: 'utf8', ...opts })

function ensureCommit(src, ref) {
  try {
    return git(src, [
      'rev-parse',
      '--verify',
      '--quiet',
      `${ref}^{commit}`
    ]).trim()
  } catch {
    out(`Fetching ${ref} into ${src} …`)
    try {
      git(src, ['fetch', '--quiet', 'origin'], { stdio: 'inherit' })
      return git(src, ['rev-parse', '--verify', `${ref}^{commit}`]).trim()
    } catch {
      fail(
        `commit ${ref} isn't in ${src}, and fetching failed. Run git fetch there and retry.`
      )
    }
  }
}

// The commit's files, extracted once with git archive into a temp folder kept per commit.
const snapshots = new Map()
function snapshot(src, sha) {
  if (snapshots.has(sha)) return snapshots.get(sha)
  const dir = path.join(os.tmpdir(), `epr-qa-control-plane-${sha}`)
  if (!fs.existsSync(path.join(dir, '.complete'))) {
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    execFileSync('sh', [
      '-c',
      `git -C "$1" archive "$2" | tar -x -C "$3"`,
      'sh',
      src,
      sha,
      dir
    ])
    fs.writeFileSync(path.join(dir, '.complete'), '')
  }
  const files = new Set(
    fs
      .readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile() && d.name !== '.complete')
      .map((d) =>
        path
          .relative(dir, path.join(d.parentPath ?? d.path, d.name))
          .split(path.sep)
          .join('/')
      )
  )
  const dirs = new Set()
  for (const f of files) {
    const parts = f.split('/')
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'))
  }
  const snap = { dir, files, dirs }
  snapshots.set(sha, snap)
  return snap
}
const tree = (src, sha) => snapshot(src, sha).files
const show = (src, sha, file) =>
  fs.readFileSync(path.join(snapshot(src, sha).dir, file))

function skillsAt(files) {
  return [...files]
    .map((f) => f.match(/^\.claude\/skills\/([^/]+)\/SKILL\.md$/)?.[1])
    .filter(Boolean)
    .sort()
}

// Repo-relative references (scripts/jira/ticket.sh, docs/quality-bar.md, docs/handoffs/) in a text file.
const REF = new RegExp(`(^|[^\\w./-])((?:${ROOTS.join('|')})/[\\w.@/-]*)`, 'g')
function refsIn(textContent, snap) {
  const found = new Set()
  for (const m of textContent.matchAll(REF)) {
    const p = m[2].replace(/[.,:;)]+$/, '').replace(/\/$/, '')
    if (snap.files.has(p) || snap.dirs.has(p)) found.add(p)
  }
  return found
}

const isText = (buf) => !buf.subarray(0, 8000).includes(0)

// What a skill needs: its own folder, plus every control-plane file it (or those files) refer to. Scripts bring
// their whole folder, since they source siblings (lib.sh).
function resolve(src, sha, files, skill) {
  const own = [...files].filter((f) => f.startsWith(`.claude/skills/${skill}/`))
  const deps = new Set()
  const queue = [...own]
  const seen = new Set()
  while (queue.length) {
    const f = queue.shift()
    if (seen.has(f)) continue
    seen.add(f)
    // Only skill files and scripts are followed: docs and the wiki mention far more than a skill uses.
    if (
      !f.startsWith('.claude/skills/') &&
      !f.startsWith('scripts/') &&
      !f.startsWith('tools/')
    )
      continue
    const buf = show(src, sha, f)
    if (!isText(buf)) continue
    for (const ref of refsIn(buf.toString('utf8'), snapshot(src, sha))) {
      const dir =
        ref.startsWith('scripts/') && files.has(ref)
          ? path.posix.dirname(ref)
          : ref
      if (files.has(dir)) {
        if (!deps.has(dir)) {
          deps.add(dir)
          queue.push(dir)
        }
        continue
      }
      // A bare docs/ or wiki/ folder is usually where a skill writes its output: name it in "paths" to copy it.
      if (!/^(scripts|tools)\//.test(dir)) continue
      for (const g of files)
        if (g.startsWith(`${dir}/`) && !deps.has(g)) {
          deps.add(g)
          queue.push(g)
        }
    }
  }
  return { own, deps: [...deps].sort() }
}

function needs(src, sha, filesList) {
  const all = filesList
    .map((f) => show(src, sha, f))
    .filter(isText)
    .map((b) => b.toString('utf8'))
    .join('\n')
  const n = []
  if (/ATLASSIAN_(USER|TOKEN)/.test(all))
    n.push('ATLASSIAN_USER/TOKEN (classic token)')
  if (/\baz (webapp|login|account|pipelines)\b|scripts\/ado\//.test(all))
    n.push('Azure CLI / DevOps')
  if (/python3?\b/.test(all)) n.push('python3')
  return n
}

// A path is rewritten only when it resolves: to the control-plane root (installed under .claude/control-plane/),
// else to the skill's own folder (skills often say `scripts/x.sh` meaning their own scripts/).
function rewrite(textContent, skill, snap) {
  return textContent
    .replace(REF, (m, pre, p) => {
      const clean = p.replace(/[.,:;)]+$/, '').replace(/\/$/, '')
      if (snap.files.has(clean) || snap.dirs.has(clean))
        return `${pre}${DEPS_REL}/${p}`
      const own = `.claude/skills/${skill}/${clean}`
      if (skill && (snap.files.has(own) || snap.dirs.has(own)))
        return `${pre}.claude/skills/${PREFIX}${skill}/${p}`
      return m
    })
    .replaceAll(`.claude/skills/${skill}/`, `.claude/skills/${PREFIX}${skill}/`)
}

function writeFile(dest, buf, skill, snap) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(
    dest,
    isText(buf) ? rewrite(buf.toString('utf8'), skill, snap) : buf
  )
}

function install() {
  const m = readManifest()
  const src = source()
  const sha = ensureCommit(src, m.ref)
  const files = tree(src, sha)
  const available = skillsAt(files)
  const unknown = m.skills.filter((s) => !available.includes(s))
  if (unknown.length)
    fail(
      `not in the control plane at ${sha.slice(0, 7)}: ${unknown.join(', ')}`
    )

  // Remove what a previous install put there, so dropped skills and files disappear.
  for (const d of fs.readdirSync(SKILLS_DIR))
    if (d.startsWith(PREFIX))
      fs.rmSync(path.join(SKILLS_DIR, d), { recursive: true })
  fs.rmSync(DEPS_DIR, { recursive: true, force: true })

  const deps = new Set()
  const report = []
  for (const skill of m.skills) {
    const r = resolve(src, sha, files, skill)
    for (const f of r.own) {
      const rel = f.slice(`.claude/skills/${skill}/`.length)
      const dest = path.join(SKILLS_DIR, `${PREFIX}${skill}`, rel)
      let buf = show(src, sha, f)
      if (rel === 'SKILL.md')
        buf = Buffer.from(
          rewrite(buf.toString('utf8'), skill, snapshot(src, sha))
            .replace(/^name:\s*.+$/m, `name: ${PREFIX}${skill}`)
            .replace(
              /^---\n[\s\S]*?\n---\n/,
              (fm) =>
                `${fm}\n<!-- Installed from epr-qa-control-plane@${sha.slice(0, 7)} by .claude/install-control-plane.mjs. Don't edit: it's overwritten on install. -->\n`
            )
        )
      if (rel === 'SKILL.md') {
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.writeFileSync(dest, buf)
      } else writeFile(dest, buf, skill, snapshot(src, sha))
    }
    for (const f of r.deps) deps.add(f)
    report.push({
      skill,
      files: r.own.length,
      deps: r.deps.length,
      needs: needs(src, sha, [...r.own, ...r.deps])
    })
  }
  for (const p of m.paths ?? [])
    for (const f of files)
      if (f === p || f.startsWith(p.replace(/\/?$/, '/'))) deps.add(f)
  for (const f of deps)
    writeFile(path.join(DEPS_DIR, f), show(src, sha, f), '', snapshot(src, sha))

  fs.mkdirSync(DEPS_DIR, { recursive: true })
  fs.writeFileSync(
    STAMP,
    `${JSON.stringify({ ref: m.ref, sha, skills: m.skills, paths: m.paths ?? [], at: new Date().toISOString() }, null, 2)}\n`
  )

  out(`Installed from epr-qa-control-plane@${sha.slice(0, 7)} (${src})`)
  for (const r of report)
    out(
      `  /${PREFIX}${r.skill}: ${r.files} skill files, ${r.deps} supporting files${r.needs.length ? ` | mentions ${r.needs.join(', ')}` : ''}`
    )
  if (m.paths?.length) out(`  paths: ${m.paths.join(', ')}`)
  out(`  supporting files: ${DEPS_REL}/ (${deps.size} files)`)
  if (!m.skills.length && !m.paths?.length)
    out('  nothing selected (manifest is empty)')
  out(
    'Start a new Claude Code session (or /reload) to pick up added or removed skills.'
  )
}

function list() {
  const m = readManifest()
  const src = source()
  const sha = ensureCommit(src, m.ref)
  const files = tree(src, sha)
  out(`epr-qa-control-plane@${sha.slice(0, 7)}`)
  const ours = new Set(
    fs.readdirSync(SKILLS_DIR).filter((d) => !d.startsWith(PREFIX))
  )
  for (const s of skillsAt(files)) {
    const r = resolve(src, sha, files, s)
    const desc =
      show(src, sha, `.claude/skills/${s}/SKILL.md`)
        .toString('utf8')
        .match(/^description:\s*(.+)$/m)?.[1] ?? ''
    const n = needs(src, sha, [...r.own, ...r.deps])
    out(
      `\n${m.skills.includes(s) ? '[x]' : '[ ]'} ${s}${ours.has(s) ? `  (this repo has its own ${s})` : ''}`
    )
    out(`    ${desc.slice(0, 160)}${desc.length > 160 ? '…' : ''}`)
    out(
      `    ${r.deps.length} supporting files${n.length ? ` | mentions ${n.join(', ')}` : ''}`
    )
  }
  out(
    '\n[x] = in .claude/control-plane.json. Add with: node .claude/install-control-plane.mjs add <skill>'
  )
}

function check() {
  // Offline and quiet when all is well: used by the SessionStart hook.
  let m
  try {
    m = readManifest()
  } catch {
    return
  }
  if (!m.skills.length && !m.paths?.length) return
  let stamp = null
  try {
    stamp = JSON.parse(fs.readFileSync(STAMP, 'utf8'))
  } catch {}
  const same =
    stamp &&
    stamp.ref === m.ref &&
    JSON.stringify(stamp.skills) === JSON.stringify(m.skills) &&
    JSON.stringify(stamp.paths) === JSON.stringify(m.paths ?? []) &&
    m.skills.every((s) =>
      fs.existsSync(path.join(SKILLS_DIR, `${PREFIX}${s}`, 'SKILL.md'))
    )
  if (!same)
    out(
      `Control-plane skills are ${stamp ? 'out of date' : 'not installed'} (${m.skills.map((s) => PREFIX + s).join(', ')}). Tell the user to run: node .claude/install-control-plane.mjs`
    )
}

function update(ref = 'origin/main') {
  const m = readManifest()
  const src = source()
  git(src, ['fetch', '--quiet', 'origin'], { stdio: 'inherit' })
  const from = ensureCommit(src, m.ref)
  const to = ensureCommit(src, ref)
  if (from === to) return out(`Already at ${to.slice(0, 7)}.`)
  const files = tree(src, to)
  const watched = m.skills.flatMap((s) => {
    const r = resolve(src, to, files, s)
    return [`.claude/skills/${s}/`, ...r.deps]
  })
  const diff = watched.length
    ? git(src, [
        'diff',
        '--stat',
        from,
        to,
        '--',
        ...watched,
        ...(m.paths ?? [])
      ]).trim()
    : ''
  out(`${from.slice(0, 7)} -> ${to.slice(0, 7)}`)
  out(diff || 'No changes in the installed skills or paths.')
  writeManifest({ ...m, ref: to })
  install()
  out(
    `\nThe pin in .claude/control-plane.json moved: review the changes above, then commit it.`
  )
}

function edit(add, names) {
  if (!names.length) fail(`usage: ${add ? 'add' : 'remove'} <skill…>`)
  const m = readManifest()
  const set = new Set(m.skills)
  for (const n of names)
    add
      ? set.add(n.replace(new RegExp(`^${PREFIX}`), ''))
      : set.delete(n.replace(new RegExp(`^${PREFIX}`), ''))
  writeManifest({ ...m, skills: [...set].sort() })
  install()
}

const [cmd = 'install', ...rest] = process.argv.slice(2)
if (os.platform() === 'win32') fail('run this from macOS, Linux or WSL')
switch (cmd) {
  case 'install':
    install()
    break
  case 'list':
    list()
    break
  case 'check':
    check()
    break
  case 'update':
    update(rest[0])
    break
  case 'add':
  case 'remove':
    edit(cmd === 'add', rest)
    break
  default:
    fail(
      'usage: install-control-plane.mjs [install|list|add|remove|update|check] (see the header of this file)'
    )
}
