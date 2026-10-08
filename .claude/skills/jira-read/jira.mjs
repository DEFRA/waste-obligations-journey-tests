#!/usr/bin/env node
// Read-only Jira Cloud client shared by the skills in this repo (mydw-manual-test, csoc-e2e,
// unsubmitted-orgs). Only GET requests are made.
//
//   node .claude/skills/jira-read/jira.mjs issue MO-449 [--json]
//   node .claude/skills/jira-read/jira.mjs children MO-31,MO-65,MO-106 [--json]
//   node .claude/skills/jira-read/jira.mjs search "project = MO AND status = 'IN QA'" [--json]
//
// Credentials come from the repo .env: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN. Scoped API tokens
// only work through the gateway (https://api.atlassian.com/ex/jira/<cloudId>), classic ones through the
// site URL, so the gateway is tried first and the site second. The token is never printed.
//
// Exit codes: 0 ok, 1 request failed, 2 credentials missing (callers fall back to asking for a paste).

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

const FIELDS =
  'summary,status,issuetype,parent,labels,fixVersions,assignee,description'

function out(text) {
  process.stdout.write(`${text}\n`)
}

function fail(message, code = 1) {
  process.stderr.write(`jira-read: ${message}\n`)
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

let apiRoots = null

async function roots({ base }) {
  if (apiRoots) return apiRoots
  const list = []
  try {
    const info = await (await fetch(`${base}/_edge/tenant_info`)).json()
    if (info.cloudId)
      list.push(`https://api.atlassian.com/ex/jira/${info.cloudId}`)
  } catch {
    // No tenant info: fall through to the site URL.
  }
  list.push(base)
  apiRoots = list
  return list
}

async function get(apiPath) {
  const creds = credentials()
  const errors = []
  for (const root of await roots(creds)) {
    const res = await fetch(`${root}/rest/api/3${apiPath}`, {
      headers: { Authorization: creds.auth, Accept: 'application/json' }
    })
    if (res.ok) {
      apiRoots = [root]
      return res.json()
    }
    errors.push(
      `${new URL(root).host} ${res.status} ${(await res.text()).slice(0, 160)}`
    )
    if (res.status !== 401 && res.status !== 403) break
  }
  fail(`GET ${apiPath.split('?')[0]} failed: ${errors.join(' | ')}`)
}

// Atlassian Document Format -> plain text that keeps headings, lists and tables readable.
const BLOCKS = new Set([
  'paragraph',
  'heading',
  'codeBlock',
  'blockquote',
  'rule',
  'tableRow'
])

function adf(node, depth = 0) {
  if (!node) return ''
  switch (node.type) {
    case 'text':
      return node.text
    case 'hardBreak':
      return '\n'
    case 'mention':
      return node.attrs.text || ''
    case 'inlineCard':
    case 'blockCard':
      return node.attrs.url
    case 'listItem':
      return `${'  '.repeat(depth)}- ${(node.content || [])
        .map((c) => adf(c, depth + 1))
        .join('')
        .trim()}\n`
    case 'tableCell':
    case 'tableHeader':
      return `${(node.content || [])
        .map((c) => adf(c, depth))
        .join(' ')
        .trim()} | `
    default: {
      const text = (node.content || []).map((c) => adf(c, depth)).join('')
      return BLOCKS.has(node.type) ? `${text}\n` : text
    }
  }
}

function toIssue(raw) {
  const f = raw.fields
  return {
    key: raw.key,
    type: f.issuetype?.name,
    status: f.status?.name,
    summary: f.summary,
    parent: f.parent
      ? { key: f.parent.key, summary: f.parent.fields?.summary }
      : null,
    labels: f.labels || [],
    fixVersions: (f.fixVersions || []).map((v) => v.name),
    assignee: f.assignee?.displayName || null,
    description: adf(f.description)
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
}

async function search(jql) {
  const issues = []
  let next
  do {
    const page = await get(
      `/search/jql?jql=${encodeURIComponent(jql)}&maxResults=100&fields=${FIELDS}${next ? `&nextPageToken=${encodeURIComponent(next)}` : ''}`
    )
    issues.push(...page.issues.map(toIssue))
    next = page.nextPageToken
  } while (next)
  return issues
}

function printIssue(i, { full }) {
  out(
    `${i.key} | ${i.type} | ${i.status} | ${i.summary}${i.parent ? ` | parent ${i.parent.key} ${i.parent.summary}` : ''}`
  )
  if (full) {
    if (i.labels.length || i.fixVersions.length)
      out(
        `labels: ${i.labels.join(', ') || '-'} | fix versions: ${i.fixVersions.join(', ') || '-'}`
      )
    out('---')
    out(i.description || '(no description)')
  }
}

async function main() {
  const [command, arg] = process.argv.slice(2)
  const json = process.argv.includes('--json')
  const full = process.argv.includes('--full')
  if (!command || !arg) {
    fail(
      'usage: jira.mjs issue <KEY> | children <EPIC[,EPIC]> | search "<JQL>" [--json] [--full]',
      1
    )
  }
  let result
  if (command === 'issue') {
    result = toIssue(
      await get(`/issue/${encodeURIComponent(arg)}?fields=${FIELDS}`)
    )
  } else if (command === 'children') {
    const keys = arg.split(',').map((k) => k.trim().toUpperCase())
    result = await search(`parent in (${keys.join(', ')}) ORDER BY parent, key`)
  } else if (command === 'search') {
    result = await search(arg)
  } else {
    fail(`unknown command ${command}`)
  }
  if (json) {
    out(JSON.stringify(result, null, 2))
  } else if (Array.isArray(result)) {
    for (const i of result) printIssue(i, { full })
    out(`(${result.length} issues)`)
  } else {
    printIssue(result, { full: true })
  }
}

main().catch((err) => fail(err.message))
