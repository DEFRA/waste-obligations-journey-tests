#!/usr/bin/env node
// Jira Cloud writes for the skills in this repo: add a comment, attach files, assign an issue to yourself.
// Nothing else.
//
//   node .claude/skills/jira-write/jira-write.mjs comment MO-449 --file comment.md [--yes]
//   node .claude/skills/jira-write/jira-write.mjs comment MO-449 --text "Retested on tst: PASS" [--yes]
//   node .claude/skills/jira-write/jira-write.mjs attach MO-449 evidence.docx [more files…] [--yes]
//   node .claude/skills/jira-write/jira-write.mjs assign MO-449 --me [--yes]
//
// Without --yes it only prints what it would send (a dry run). Claude runs it with --yes only after the user
// has approved that exact change. Credentials and the gateway-then-site lookup are the same as jira-read
// (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN in the repo .env); the token needs write access to the issue.
// The token is never printed.
//
// Exit codes: 0 ok (or dry run), 1 request failed, 2 credentials missing.

import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
)
dotenv.config({ path: path.join(REPO_ROOT, '.env'), quiet: true })

const KEY = /^[A-Z][A-Z0-9]+-\d+$/
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

function out(text) {
  process.stdout.write(`${text}\n`)
}

function fail(message, code = 1) {
  process.stderr.write(`jira-write: ${message}\n`)
  process.exit(code)
}

function credentials() {
  const base = (process.env.JIRA_BASE_URL || '').trim().replace(/\/+$/, '')
  const email = (process.env.JIRA_EMAIL || '').trim()
  const token = (process.env.JIRA_API_TOKEN || '').trim()
  const missing = Object.entries({
    JIRA_BASE_URL: base,
    JIRA_EMAIL: email,
    JIRA_API_TOKEN: token
  })
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length) fail(`missing ${missing.join(', ')} in .env`, 2)
  return {
    base,
    auth: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`
  }
}

// Scoped tokens only work through the gateway, classic ones through the site URL: try the gateway first.
async function roots(base) {
  const list = []
  try {
    const info = await (await fetch(`${base}/_edge/tenant_info`)).json()
    if (info.cloudId)
      list.push(`https://api.atlassian.com/ex/jira/${info.cloudId}`)
  } catch {
    // No tenant info: fall through to the site URL.
  }
  list.push(base)
  return list
}

async function send(apiPath, init) {
  const creds = credentials()
  const errors = []
  for (const root of await roots(creds.base)) {
    const res = await fetch(`${root}/rest/api/3${apiPath}`, {
      ...init(),
      headers: {
        Authorization: creds.auth,
        Accept: 'application/json',
        ...init().headers
      }
    })
    if (res.ok) {
      // Assigning answers 204 with no body.
      const body = await res.text()
      return body ? JSON.parse(body) : {}
    }
    errors.push(
      `${new URL(root).host} ${res.status} ${(await res.text()).slice(0, 160)}`
    )
    // Only an auth failure is worth retrying on the other root; anything else would repeat the write.
    if (res.status !== 401 && res.status !== 403) break
  }
  fail(`${init().method || 'GET'} ${apiPath} failed: ${errors.join(' | ')}`)
}

// Plain text / light Markdown -> Atlassian Document Format: paragraphs, "- " bullets, "1. " numbered items,
// "# " headings, **bold** and `code`.
function inline(text) {
  const nodes = []
  for (const part of text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
    if (!part) continue
    if (part.startsWith('**') && part.endsWith('**'))
      nodes.push({
        type: 'text',
        text: part.slice(2, -2),
        marks: [{ type: 'strong' }]
      })
    else if (part.startsWith('`') && part.endsWith('`'))
      nodes.push({
        type: 'text',
        text: part.slice(1, -1),
        marks: [{ type: 'code' }]
      })
    else nodes.push({ type: 'text', text: part })
  }
  return nodes
}

function toAdf(text) {
  const content = []
  let list = null
  for (const block of text.replace(/\r/g, '').split('\n')) {
    const line = block.trimEnd()
    const bullet = line.match(/^\s*[-*] (.*)$/)
    const numbered = line.match(/^\s*\d+\. (.*)$/)
    const heading = line.match(/^(#{1,6}) (.*)$/)
    if (bullet || numbered) {
      const type = bullet ? 'bulletList' : 'orderedList'
      if (!list || list.type !== type) {
        list = { type, content: [] }
        content.push(list)
      }
      list.content.push({
        type: 'listItem',
        content: [
          { type: 'paragraph', content: inline((bullet || numbered)[1]) }
        ]
      })
      continue
    }
    list = null
    if (!line.trim()) continue
    if (heading) {
      content.push({
        type: 'heading',
        attrs: { level: heading[1].length },
        content: inline(heading[2])
      })
    } else {
      content.push({ type: 'paragraph', content: inline(line) })
    }
  }
  return { type: 'doc', version: 1, content }
}

function option(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? null : process.argv[i + 1]
}

async function comment(key, yes) {
  const file = option('--file')
  const text = file
    ? readFileSync(path.resolve(file), 'utf8')
    : option('--text')
  if (!text || !text.trim())
    fail('comment needs --file <path> or --text "<text>"')
  out(`Comment for ${key} (${text.trim().split('\n').length} lines):`)
  out('---')
  out(text.trim())
  out('---')
  if (!yes)
    return out(
      'Dry run: nothing sent. Re-run with --yes once the user has approved this comment.'
    )
  const body = JSON.stringify({ body: toAdf(text.trim()) })
  const res = await send(`/issue/${key}/comment`, () => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  }))
  out(`Comment ${res.id} added to ${key}.`)
}

async function attach(key, files, yes) {
  if (!files.length) fail('attach needs at least one file')
  const list = files.map((f) => {
    const full = path.resolve(f)
    let size
    try {
      size = statSync(full).size
    } catch {
      fail(`no such file: ${f}`)
    }
    if (size > MAX_ATTACHMENT_BYTES) fail(`${f} is over 10 MB`)
    return { full, name: path.basename(full), size }
  })
  out(`Attachments for ${key}:`)
  for (const f of list) out(`- ${f.name} (${Math.ceil(f.size / 1024)} KB)`)
  if (!yes)
    return out(
      'Dry run: nothing sent. Re-run with --yes once the user has approved these files.'
    )
  const res = await send(`/issue/${key}/attachments`, () => {
    const form = new FormData()
    for (const f of list)
      form.append('file', new Blob([readFileSync(f.full)]), f.name)
    return {
      method: 'POST',
      headers: { 'X-Atlassian-Token': 'no-check' },
      body: form
    }
  })
  out(
    `Attached ${res.length} file(s) to ${key}: ${res.map((a) => a.filename).join(', ')}`
  )
}

// Assigns the issue to the account that owns the token (the user running the skill).
async function assignToMe(key, yes) {
  if (!process.argv.includes('--me')) {
    fail('assign only supports --me (assign the issue to yourself)')
  }
  const me = await send('/myself', () => ({ method: 'GET' }))
  out(`Assign ${key} to ${me.displayName}.`)
  if (!yes)
    return out(
      'Dry run: nothing sent. Re-run with --yes once the user has approved this.'
    )
  await send(`/issue/${key}/assignee`, () => ({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId: me.accountId })
  }))
  out(`${key} assigned to ${me.displayName}.`)
}

async function main() {
  const args = process.argv.slice(2)
  const yes = args.includes('--yes')
  const positional = args.filter(
    (a, i) => !a.startsWith('--') && !['--file', '--text'].includes(args[i - 1])
  )
  const [command, rawKey, ...rest] = positional
  const key = (rawKey || '').toUpperCase()
  if (!['comment', 'attach', 'assign'].includes(command) || !KEY.test(key)) {
    fail(
      'usage: jira-write.mjs comment <KEY> --file <path> | --text "<text>" [--yes]\n' +
        '       jira-write.mjs attach <KEY> <file> [file…] [--yes]\n' +
        '       jira-write.mjs assign <KEY> --me [--yes]'
    )
  }
  if (command === 'comment') await comment(key, yes)
  else if (command === 'assign') await assignToMe(key, yes)
  else await attach(key, rest, yes)
}

main().catch((err) => fail(err.message))
