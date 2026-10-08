#!/usr/bin/env node
// Read-only Confluence Cloud client for the skills in this repo. Only GET requests are made.
//
//   node .claude/skills/confluence-read/confluence.mjs page <id | page URL> [--json]   # title, version, body as text
//   node .claude/skills/confluence-read/confluence.mjs title "<exact title>" [--space <spaceId>] [--json]
//   node .claude/skills/confluence-read/confluence.mjs children <id> [--json]
//
// Credentials from the repo .env: CONFLUENCE_BASE_URL (https://<site>/wiki), CONFLUENCE_API_TOKEN, and
// CONFLUENCE_EMAIL (falls back to JIRA_EMAIL). Scoped tokens only work through the gateway
// (https://api.atlassian.com/ex/confluence/<cloudId>/wiki) and only with the v2 API; classic tokens also work on
// the site URL, which is tried second. The token is never printed.
//
// Exit codes: 0 ok, 1 request failed or not found, 2 credentials missing.

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

const out = (t) => process.stdout.write(`${t}\n`)
function fail(message, code = 1) {
  process.stderr.write(`confluence-read: ${message}\n`)
  process.exit(code)
}

function credentials() {
  const base = (process.env.CONFLUENCE_BASE_URL || '').trim()
  const email = (
    process.env.CONFLUENCE_EMAIL ||
    process.env.JIRA_EMAIL ||
    ''
  ).trim()
  const token = (process.env.CONFLUENCE_API_TOKEN || '').trim()
  const missing = Object.entries({
    CONFLUENCE_BASE_URL: base,
    'CONFLUENCE_EMAIL (or JIRA_EMAIL)': email,
    CONFLUENCE_API_TOKEN: token
  })
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length) fail(`missing ${missing.join(', ')} in .env`, 2)
  return {
    site: new URL(base).origin,
    auth: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`
  }
}

let roots = null
async function apiRoots(site) {
  if (roots) return roots
  roots = []
  try {
    const info = await (await fetch(`${site}/_edge/tenant_info`)).json()
    if (info.cloudId)
      roots.push(`https://api.atlassian.com/ex/confluence/${info.cloudId}/wiki`)
  } catch {
    // No tenant info: fall through to the site URL.
  }
  roots.push(`${site}/wiki`)
  return roots
}

async function get(apiPath) {
  const creds = credentials()
  const errors = []
  for (const root of await apiRoots(creds.site)) {
    const res = await fetch(`${root}/api/v2${apiPath}`, {
      headers: { Authorization: creds.auth, Accept: 'application/json' }
    })
    if (res.ok) {
      roots = [root]
      return res.json()
    }
    errors.push(
      `${new URL(root).host} ${res.status} ${(await res.text()).slice(0, 120)}`
    )
    if (res.status !== 401 && res.status !== 403) break
  }
  fail(`GET ${apiPath.split('?')[0]} failed: ${errors.join(' | ')}`)
}

const ENTITIES = {
  Dagger: '‡',
  dagger: '†',
  bull: '•',
  hellip: '…',
  rarr: '→',
  larr: '←',
  pound: '£',
  euro: '€',
  times: '×',
  check: '✓',
  ndash: '-',
  mdash: '-',
  rsquo: "'",
  lsquo: "'",
  ldquo: '"',
  rdquo: '"',
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"'
}

// Confluence storage format (XHTML) -> readable text: headings, list items, table rows, paragraphs.
function toText(html) {
  // List items are indented by their nesting depth.
  let depth = 0
  const nested = String(html || '').replace(
    /<(\/?)(ul|ol)\b[^>]*>|<li\b[^>]*>/g,
    (tag, close, list) => {
      if (list) {
        depth = Math.max(0, depth + (close ? -1 : 1))
        return close ? '\n' : ''
      }
      return `\n${'  '.repeat(Math.max(0, depth - 1))}- `
    }
  )
  return nested
    .replace(
      /<ac:structured-macro[^>]*ac:name="(?:toc|children)"[\s\S]*?<\/ac:structured-macro>/g,
      ''
    )
    .replace(/<h([1-6])[^>]*>/g, (_, n) => `\n\n${'#'.repeat(Number(n))} `)
    .replace(/<\/h[1-6]>/g, '\n')
    .replace(/<\/t[dh]>/g, ' | ')
    .replace(/<tr[^>]*>/g, '\n| ')
    .replace(/<(br|\/p|\/tr|\/table)[^>]*>/g, '\n')
    .replace(
      /<ac:link>[\s\S]*?ri:content-title="([^"]*)"[\s\S]*?<\/ac:link>/g,
      '[$1]'
    )
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;|&mdash;/g, '-')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n\s*\n(\s*- )/g, '\n$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const pageId = (arg) =>
  (String(arg).match(/pages\/(\d+)/) || String(arg).match(/^(\d+)$/) || [])[1]

function option(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? null : process.argv[i + 1]
}

async function main() {
  const [command, arg] = process.argv.slice(2)
  const json = process.argv.includes('--json')
  if (!command || !arg) {
    fail(
      'usage: confluence.mjs page <id|url> | title "<exact title>" [--space <id>] | children <id> [--json]'
    )
  }
  if (command === 'page') {
    const id = pageId(arg)
    if (!id) fail(`not a page id or URL: ${arg}`)
    const p = await get(`/pages/${id}?body-format=storage`)
    const page = {
      id: p.id,
      title: p.title,
      spaceId: p.spaceId,
      parentId: p.parentId,
      version: p.version && p.version.number,
      updated: p.version && p.version.createdAt,
      url: `${credentials().site}/wiki${(p._links && p._links.webui) || `/pages/${p.id}`}`,
      text: toText(p.body && p.body.storage && p.body.storage.value)
    }
    if (json) return out(JSON.stringify(page, null, 2))
    out(
      `${page.title} | page ${page.id} | v${page.version} updated ${String(page.updated).slice(0, 10)}`
    )
    out(page.url)
    out('---')
    out(page.text || '(empty page)')
  } else if (command === 'title') {
    const space = option('--space')
    const r = await get(
      `/pages?title=${encodeURIComponent(arg)}&limit=50${space ? `&space-id=${space}` : ''}`
    )
    const rows = r.results.map((p) => ({
      id: p.id,
      title: p.title,
      spaceId: p.spaceId
    }))
    if (json) return out(JSON.stringify(rows, null, 2))
    for (const p of rows) out(`${p.id} | ${p.title} | space ${p.spaceId}`)
    out(`(${rows.length} pages; exact title match only)`)
  } else if (command === 'children') {
    const id = pageId(arg)
    const r = await get(`/pages/${id}/children?limit=250`)
    const rows = r.results.map((p) => ({ id: p.id, title: p.title }))
    if (json) return out(JSON.stringify(rows, null, 2))
    for (const p of rows) out(`${p.id} | ${p.title}`)
    out(`(${rows.length} child pages)`)
  } else {
    fail(`unknown command ${command}`)
  }
}

main().catch((e) => fail(e.message))
