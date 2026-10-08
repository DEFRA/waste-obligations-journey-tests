#!/usr/bin/env node
// Renders captured notification emails to PNG and rebuilds the evidence pack.
// runner.mjs calls renderEmails() itself after email capture; run this file
// directly only to re-render a pack (e.g. after capturing emails by hand).
//
// Input (under <evidenceDir>/emails/, written by email-capture.mjs):
//   expected.json          written by runner.mjs
//   <file>.json            one per recipient: headers + status (RECEIVED | NOT_FOUND)
//   <file>.html | .txt     the email body, when RECEIVED
//
// Output:
//   <file>.png               full-page render with a From/To/Subject header
//   the run's .docx, rebuilt in place with a "Notification emails" section
//
// Usage:
//   node .claude/skills/csoc-e2e/render-emails.mjs <evidenceDir> [<evidenceDir> ...]

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { buildEvidencePack, readRunInfo } from './evidence-pack.mjs'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function readBody(emailsDir, meta, stem) {
  for (const ext of ['html', 'txt']) {
    try {
      const raw = await readFile(path.join(emailsDir, `${stem}.${ext}`), 'utf8')
      return ext === 'html'
        ? raw
        : `<pre style="white-space:pre-wrap;font:14px/1.5 sans-serif">${escapeHtml(raw)}</pre>`
    } catch {
      // try the next extension
    }
  }
  return `<p><em>Body not saved for message ${escapeHtml(meta.messageId)}.</em></p>`
}

function pageHtml({ entry, recipient, meta, body }) {
  const rows = [
    ['Trigger', `${entry.trigger} (${entry.phase})`],
    ['From', meta.from],
    ['To', meta.to ?? recipient.address],
    ['Subject', meta.subject],
    ['Received', meta.date],
    ['Gmail message id', meta.messageId]
  ]
    .map(
      ([k, v]) =>
        `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`
    )
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    .evidence-header{font:13px/1.4 Arial,sans-serif;border-collapse:collapse;width:100%;margin:0 0 16px;background:#f3f2f1}
    .evidence-header th{text-align:left;width:160px;padding:6px 10px;border:1px solid #b1b4b6;background:#dee0e2}
    .evidence-header td{padding:6px 10px;border:1px solid #b1b4b6}
    .evidence-body{border-top:3px solid #1d70b8;padding-top:12px}
  </style></head><body style="margin:16px">
  <table class="evidence-header">${rows}</table>
  <div class="evidence-body">${body}</div>
  </body></html>`
}

// Screenshots every RECEIVED email under <evidenceDir>/emails/ to <file>.png.
export async function renderEmails(evidenceDir) {
  const emailsDir = path.join(evidenceDir, 'emails')
  const expected = await readJson(path.join(emailsDir, 'expected.json'))
  if (!Array.isArray(expected)) return { rendered: 0, missing: 0 }
  const browser = await chromium.launch()
  try {
    return await renderWith(browser, emailsDir, expected)
  } finally {
    await browser.close()
  }
}

async function renderWith(browser, emailsDir, expected) {
  // Email HTML is untrusted third-party markup: no scripts.
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 900, height: 800 }
  })
  const page = await context.newPage()
  let rendered = 0
  let missing = 0
  for (const entry of expected) {
    for (const recipient of entry.recipients ?? []) {
      const stem = recipient.file
      const meta = await readJson(path.join(emailsDir, `${stem}.json`))
      if (!meta) {
        console.warn(`[render-emails] ${stem}: not captured yet`)
        missing += 1
        continue
      }
      if (meta.status === 'NOT_FOUND') {
        console.warn(`[render-emails] ${stem}: NOT_FOUND (${meta.query})`)
        missing += 1
        continue
      }
      const body = await readBody(emailsDir, meta, stem)
      await page.setContent(pageHtml({ entry, recipient, meta, body }), {
        waitUntil: 'load',
        timeout: 15000
      }).catch((err) => {
        // Remote images (e.g. the GOV.UK crest) can be slow; the text
        // content is what matters, so render with whatever has loaded.
        console.warn(`[render-emails] ${stem}: load incomplete (${err.message})`)
      })
      await page.screenshot({
        path: path.join(emailsDir, `${stem}.png`),
        fullPage: true
      })
      rendered += 1
    }
  }
  await context.close()
  return { rendered, missing }
}

async function main() {
  const dirs = process.argv.slice(2)
  if (!dirs.length) {
    console.error('Usage: node .claude/skills/csoc-e2e/render-emails.mjs <evidenceDir> [...]')
    process.exit(1)
  }
  for (const dir of dirs) {
    const evidenceDir = path.resolve(dir)
    const { rendered, missing } = await renderEmails(evidenceDir)
    const run = await readRunInfo(evidenceDir)
    const docPath = await buildEvidencePack({ ...run, evidenceDir })
    console.log(
      `[render-emails] ${evidenceDir}: rendered ${rendered}, missing ${missing} → ${docPath}`
    )
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.stack || err)
    process.exit(1)
  })
}
