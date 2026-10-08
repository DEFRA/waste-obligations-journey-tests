#!/usr/bin/env node
// Renders an E2E test plan written in the e2e-test-plan Markdown format as one HTML page that pastes cleanly into
// Confluence (Markdown tables with line breaks don't). Every "## " section whose cases are "### <ID> <title>"
// becomes a table: Scenario ID | Steps | Evidence | Result. Everything else (intro, accounts, coverage) is
// rendered as normal HTML.
//
//   node .claude/skills/e2e-test-plan/render-html.mjs <plan.md> <plan.html> [--results results.json]
//
// Without --results the Evidence and Result columns are empty, ready to fill in. results.json maps a case id to
// { "evidence": "...", "result": "PASS" | "FAIL ..." | "NOT RUN ..." } and fills them.

import { readFileSync, writeFileSync } from 'node:fs'

const [docPath, outPath] = process.argv.slice(2)
if (!docPath || !outPath || docPath.startsWith('--')) {
  process.stderr.write(
    'usage: render-html.mjs <plan.md> <plan.html> [--results results.json]\n'
  )
  process.exit(1)
}
const resultsAt = process.argv.indexOf('--results')
const results =
  resultsAt === -1
    ? {}
    : JSON.parse(readFileSync(process.argv[resultsAt + 1], 'utf8'))

const CASE_ID = /^([A-Z][A-Z0-9]*-\d+(?:\.\d+)?[a-z]?)\b\s*(.*)$/

const escape = (t) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function inline(t) {
  return escape(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])_([^_]+)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>')
}

// "- " and "1. " lines with two-space nesting -> nested lists.
function lists(lines) {
  const out = []
  const stack = []
  for (const line of lines) {
    const m = line.match(/^(\s*)(- |\d+\. )(.*)$/)
    if (!m) continue
    const depth = Math.floor(m[1].length / 2)
    const tag = /\d/.test(m[2][0]) ? 'ol' : 'ul'
    while (stack.length > depth + 1) out.push(`</li></${stack.pop()}>`)
    if (stack.length === depth + 1) out.push('</li>')
    else {
      out.push(`<${tag}>`)
      stack.push(tag)
    }
    out.push(`<li>${inline(m[3])}`)
  }
  while (stack.length) out.push(`</li></${stack.pop()}>`)
  return out.join('')
}

// Paragraphs, headings, lists, tables and rules.
function blocks(text) {
  const out = []
  let para = []
  let list = []
  let table = []
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`)
    if (list.length) out.push(lists(list))
    if (table.length) {
      const rows = table
        .filter((r) => !/^\|\s*:?-/.test(r))
        .map((r) =>
          r
            .trim()
            .replace(/^\||\|$/g, '')
            .split(/(?<!\\)\|/)
            .map((c) => c.trim().replace(/\\\|/g, '|'))
        )
      const head = rows[0].map((c) => `<th>${inline(c)}</th>`).join('')
      const body = rows
        .slice(1)
        .map(
          (r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`
        )
        .join('')
      out.push(
        `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
      )
    }
    para = []
    list = []
    table = []
  }
  for (const line of text.split('\n')) {
    const heading = line.match(/^(#{1,4}) (.*)$/)
    if (!line.trim()) flush()
    else if (line.trim() === '---') {
      flush()
      out.push('<hr>')
    } else if (heading) {
      flush()
      const n = heading[1].length
      out.push(`<h${n}>${inline(heading[2])}</h${n}>`)
    } else if (line.startsWith('|')) table.push(line)
    else if (/^\s*(- |\d+\. )/.test(line)) list.push(line)
    else if (list.length && line.startsWith('  '))
      list[list.length - 1] += ` ${line.trim()}`
    else para.push(line.trim())
  }
  flush()
  return out.join('\n')
}

// One case body -> meta line(s), numbered steps, Expected list.
function steps(body) {
  const meta = []
  const stepLines = []
  const expected = []
  let inExpected = false
  for (const line of body.split('\n')) {
    if (!line.trim() || line.trim() === '---') continue
    if (line.startsWith('**Expected:**')) {
      inExpected = true
      const rest = line.slice('**Expected:**'.length).trim()
      if (rest) expected.push(`- ${rest}`)
    } else if (inExpected) expected.push(line)
    else if (/^\s*(\d+\. |- )/.test(line)) stepLines.push(line)
    else meta.push(inline(line.trim()))
  }
  return (
    (meta.length ? `<p class="meta">${meta.join('<br>')}</p>` : '') +
    lists(stepLines) +
    (expected.length
      ? `<p><strong>Expected:</strong></p>${lists(expected)}`
      : '')
  )
}

function resultCell(id) {
  const r = (results[id] && results[id].result) || ''
  const cls = /FAIL/.test(r)
    ? 'fail'
    : /PASS/.test(r)
      ? 'pass'
      : r
        ? 'notrun'
        : 'blank'
  return `<td class="${cls}">${inline(r)}</td>`
}

function caseTable(section) {
  const [head, ...cases] = section.split(/^### /m)
  const rows = cases.map((c) => {
    const [title, ...rest] = c.split('\n')
    const m = title.match(CASE_ID)
    return (
      `<tr><td class="id"><strong>${escape(m[1])}</strong><br>${inline(m[2])}</td>` +
      `<td>${steps(rest.join('\n'))}</td>` +
      `<td>${inline((results[m[1]] && results[m[1]].evidence) || '')}</td>${resultCell(m[1])}</tr>`
    )
  })
  return (
    blocks(head) +
    '<table class="cases"><thead><tr><th>Scenario ID</th><th>Steps</th><th>Evidence</th><th>Result</th></tr></thead>' +
    `<tbody>${rows.join('')}</tbody></table>`
  )
}

const doc = readFileSync(docPath, 'utf8')
const [intro, ...sections] = doc.split(/^(?=## )/m)
const isCaseSection = (s) =>
  s.split(/^### /m).slice(1).length > 0 &&
  s
    .split(/^### /m)
    .slice(1)
    .every((c) => CASE_ID.test(c.split('\n')[0]))
const body =
  blocks(intro) +
  sections
    .map((s) =>
      isCaseSection(s) ? caseTable(s.replace(/\n---\s*$/, '\n')) : blocks(s)
    )
    .join('\n')
const title = (doc.match(/^# (.*)$/m) || [, 'E2E test plan'])[1]

const CSS = `
:root { --fg:#1d1d1f; --bg:#fff; --muted:#5f6368; --line:#d0d4d9; --head:#f3f4f6; --pass:#e6f4ea; --fail:#fce8e6; --notrun:#f1f3f4; }
@media (prefers-color-scheme: dark) { :root { --fg:#e8eaed; --bg:#1f1f1f; --muted:#9aa0a6; --line:#3c4043; --head:#2a2b2e; --pass:#1e3a29; --fail:#4a2321; --notrun:#2a2b2e; } }
body { font: 14px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--fg); background: var(--bg); margin: 24px auto; max-width: 1400px; padding: 0 16px; }
table { border-collapse: collapse; width: 100%; margin: 12px 0 24px; }
th, td { border: 1px solid var(--line); padding: 6px 8px; vertical-align: top; text-align: left; }
th { background: var(--head); }
table.cases td.id { width: 12%; } table.cases td:nth-child(2) { width: 50%; } table.cases td:nth-child(3) { width: 22%; font-size: 12px; }
td.pass { background: var(--pass); } td.fail { background: var(--fail); } td.notrun { background: var(--notrun); } td.blank { min-width: 90px; }
.meta { color: var(--muted); font-style: italic; margin: 0 0 4px; }
td ol, td ul { margin: 2px 0 6px; padding-left: 20px; } td p { margin: 4px 0; }
code { font-size: 12px; overflow-wrap: anywhere; }
`
writeFileSync(
  outPath,
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${escape(title)}</title><style>${CSS}</style></head><body>${body}</body></html>\n`
)
process.stdout.write(`${outPath}\n`)
