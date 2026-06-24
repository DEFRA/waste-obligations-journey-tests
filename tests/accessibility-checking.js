import * as wcagChecker from '../dist/wcagchecker.js'
import fs from 'fs'
import path from 'path'

const reportDirectory = path.join('./reports')

// `dist/wcagchecker.js` was bundled for WebdriverIO and expects a driver with
// WdIO-shaped methods. Wrap a Playwright `page` so the same lib can be used
// from this Playwright suite without modifying the bundle.
function asWdioDriver(page) {
  return {
    getUrl: async () => page.url(),
    getTitle: async () => page.title(),
    // Playwright has no per-script timeout; rely on the surrounding test timeout.
    setTimeout: async () => {},
    execute: async (script, ...args) => {
      if (typeof script === 'string') {
        // WdIO treats the string as a function body (so `return` works).
        // Wrap in an IIFE so Playwright can evaluate it as an expression.
        return page.evaluate(`(function () { ${script} })()`)
      }
      return page.evaluate(script, ...args)
    },
    executeAsync: async (fn, ...args) => {
      return page.evaluate(
        ({ fnSource, evalArgs }) => {
          // eslint-disable-next-line no-new-func
          const userFn = new Function(`return (${fnSource})`)()
          return new Promise((resolve) => userFn(...evalArgs, resolve))
        },
        { fnSource: fn.toString(), evalArgs: args }
      )
    }
  }
}

export async function initialiseAccessibilityChecking() {
  if (!fs.existsSync(reportDirectory)) {
    fs.mkdirSync(reportDirectory, { recursive: true })
  }

  await wcagChecker.init()
}

export async function analyseAccessibility(page, suffix) {
  await wcagChecker.analyse(asWdioDriver(page), suffix)
}

export function generateAccessibilityReports(filePrefix) {
  const categoryReport = wcagChecker.getHtmlReportByCategory()
  const guidelineReport = wcagChecker.getHtmlReportByGuideLine()

  if (categoryReport && categoryReport.length > 0) {
    fs.writeFileSync(
      path.join(reportDirectory, `${filePrefix}-accessibility-category.html`),
      categoryReport
    )
  }

  if (guidelineReport && guidelineReport.length > 0) {
    fs.writeFileSync(
      path.join(reportDirectory, `${filePrefix}-accessibility-guideline.html`),
      guidelineReport
    )
  }

  const summary = buildPerPageSummary()
  if (summary.length > 0) {
    fs.writeFileSync(
      path.join(reportDirectory, `${filePrefix}-accessibility-summary.json`),
      JSON.stringify({ summary }, null, 2)
    )
  }
}

// The bundled report functions don't itemise `minor` axe violations and report
// "Low Impacts" as clean-element count. We compute our own per-page summary
// from the bundle's exported deserialisers so the landing index can surface
// real low-impact counts without touching the vendored bundle.
function buildPerPageSummary() {
  const stats = wcagChecker.deserializedStatistics()
  const records = wcagChecker
    .deserializedWaveResults()
    .concat(wcagChecker.deserializedAxeResults())
  return stats.map((s) => {
    const forPage = records.filter((r) => r.URL === s.URL)
    const countOf = (type) => forPage.filter((r) => r.Type === type).length
    const error = parseInt(s.Error, 10) || 0
    const contrast = parseInt(s.Contrast, 10) || 0
    const alert = parseInt(s.Alert, 10) || 0
    return {
      url: s.URL,
      pageTitle: s.PageTitle,
      critical: error + contrast + countOf('critical') + countOf('serious'),
      medium: alert + countOf('moderate'),
      low: countOf('minor')
    }
  })
}

export function generateAccessibilityReportIndex() {
  if (!fs.existsSync(reportDirectory)) {
    fs.mkdirSync(reportDirectory, { recursive: true })
    return
  }

  const allFiles = fs.readdirSync(reportDirectory)
  const filenames = allFiles.filter(
    (f) => f.endsWith('.html') && f !== 'index.html'
  )
  const summaryFiles = allFiles.filter((f) =>
    f.endsWith('-accessibility-summary.json')
  )

  const pages = []
  const totals = { critical: 0, medium: 0, low: 0 }
  for (const file of summaryFiles) {
    let parsed
    try {
      parsed = JSON.parse(
        fs.readFileSync(path.join(reportDirectory, file), 'utf8')
      )
    } catch {
      // Skip unreadable / malformed sidecars rather than failing the whole
      // index. Kept narrow so a bug in the aggregation loop below still throws.
      continue
    }
    if (!Array.isArray(parsed.summary)) continue
    for (const page of parsed.summary) {
      pages.push({
        title: page.pageTitle || page.url,
        url: page.url,
        critical: Number(page.critical) || 0,
        medium: Number(page.medium) || 0,
        low: Number(page.low) || 0
      })
      totals.critical += Number(page.critical) || 0
      totals.medium += Number(page.medium) || 0
      totals.low += Number(page.low) || 0
    }
  }

  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        })[c]
    )

  const totalsBlock =
    pages.length === 0
      ? ''
      : `
        <div class="totals">
            <div class="totals-card totals-critical">
                <div class="totals-label">Critical issues</div>
                <div class="totals-value">${totals.critical}</div>
            </div>
            <div class="totals-card totals-medium">
                <div class="totals-label">Medium issues</div>
                <div class="totals-value">${totals.medium}</div>
            </div>
            <div class="totals-card totals-low">
                <div class="totals-label">Low issues</div>
                <div class="totals-value">${totals.low}</div>
            </div>
        </div>
        <h2>Per-page issue counts</h2>
        <table class="page-table">
            <thead>
                <tr>
                    <th scope="col">Page</th>
                    <th scope="col">Critical</th>
                    <th scope="col">Medium</th>
                    <th scope="col">Low</th>
                </tr>
            </thead>
            <tbody>
                ${pages
                  .map(
                    (p) => `
                <tr>
                    <td><div class="page-title">${escape(p.title)}</div><div class="page-url">${escape(p.url)}</div></td>
                    <td class="num critical">${p.critical}</td>
                    <td class="num medium">${p.medium}</td>
                    <td class="num low">${p.low}</td>
                </tr>`
                  )
                  .join('')}
            </tbody>
        </table>
      `

  const html = `
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Accessibility Testing Reports</title>
                <style>
                    body {
                        font-family: 'GDS Transport', arial, sans-serif;
                        max-width: 1200px;
                        margin: 0 auto;
                        padding: 20px;
                        background-color: #f8f8f8;
                    }
                    .header {
                        background: #1d70b8;
                        color: white;
                        padding: 20px;
                        border-radius: 8px;
                        margin-bottom: 30px;
                    }
                    .header h1 {
                        margin: 0;
                        font-size: 2rem;
                    }
                    .header p {
                        margin: 10px 0 0 0;
                        opacity: 0.9;
                    }
                    .reports-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
                        gap: 20px;
                        margin-bottom: 30px;
                    }
                    .report-card {
                        background: white;
                        border: 1px solid #dee2e6;
                        border-radius: 8px;
                        padding: 20px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        transition: transform 0.2s;
                    }
                    .report-card:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 4px 8px rgba(0,0,0,0.15);
                    }
                    .report-title {
                        font-size: 1.2rem;
                        font-weight: bold;
                        color: #1d70b8;
                        margin-bottom: 10px;
                        text-decoration: none;
                    }
                    .report-title:hover {
                        text-decoration: underline;
                    }
                    .report-type {
                        background: #f0f9ff;
                        color: #1d70b8;
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 0.8rem;
                        font-weight: bold;
                        display: inline-block;
                        margin-bottom: 10px;
                    }
                    .footer {
                        text-align: center;
                        margin-top: 40px;
                        padding: 20px;
                        color: #666;
                        border-top: 1px solid #dee2e6;
                    }
                    .totals {
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        gap: 16px;
                        margin-bottom: 30px;
                    }
                    .totals-card {
                        background: white;
                        border: 1px solid #dee2e6;
                        border-radius: 8px;
                        padding: 20px;
                        text-align: center;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
                    .totals-label {
                        font-size: 0.9rem;
                        color: #666;
                        margin-bottom: 8px;
                        text-transform: uppercase;
                        letter-spacing: 0.05em;
                    }
                    .totals-value {
                        font-size: 2.5rem;
                        font-weight: bold;
                    }
                    .totals-critical .totals-value { color: #d4351c; }
                    .totals-medium .totals-value { color: #f47738; }
                    .totals-low .totals-value { color: #00703c; }
                    h2 {
                        font-size: 1.3rem;
                        margin-top: 30px;
                        margin-bottom: 12px;
                    }
                    .page-table {
                        width: 100%;
                        border-collapse: collapse;
                        background: white;
                        border: 1px solid #dee2e6;
                        border-radius: 8px;
                        overflow: hidden;
                        margin-bottom: 30px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
                    .page-table th,
                    .page-table td {
                        padding: 10px 14px;
                        text-align: left;
                        border-bottom: 1px solid #eee;
                        vertical-align: top;
                    }
                    .page-table th {
                        background: #f3f3f3;
                        font-size: 0.85rem;
                        text-transform: uppercase;
                    }
                    .page-table tr:last-child td {
                        border-bottom: none;
                    }
                    .page-table .num {
                        text-align: right;
                        font-variant-numeric: tabular-nums;
                        font-weight: bold;
                        width: 80px;
                    }
                    .page-table .num.critical { color: #d4351c; }
                    .page-table .num.medium { color: #f47738; }
                    .page-table .num.low { color: #00703c; }
                    .page-url {
                        font-size: 0.8rem;
                        color: #666;
                        word-break: break-all;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Accessibility Testing Reports</h1>
                    <p>Generated on ${new Date().toLocaleString()}</p>
                    <p>Total Reports: ${filenames.length}</p>
                </div>

                ${totalsBlock}

                ${
                  filenames.length === 0
                    ? '<div class="report-card"><p>No accessibility reports found. Run tests with the accessibility config to generate reports.</p></div>'
                    : `<div class="reports-grid">
                        ${filenames
                          .map((filename) => {
                            const isCategory = filename.includes('-category')
                            const isGuideline = filename.includes('-guideline')
                            const reportType = isCategory
                              ? 'By Category'
                              : isGuideline
                                ? 'By Guideline'
                                : 'General'
                            const displayName = filename
                              .replace('-accessibility-category.html', '')
                              .replace('-accessibility-guideline.html', '')
                              .replace('.html', '')
                              .replace(/-/g, ' ')
                              .replace(/\b\w/g, (l) => l.toUpperCase())

                            return `
                                <div class="report-card">
                                    <div class="report-type">${reportType}</div>
                                    <a href="${filename}" class="report-title">${displayName}</a>
                                    <p>Click to view detailed accessibility analysis</p>
                                </div>
                            `
                          })
                          .join('')}
                    </div>`
                }

                <div class="footer">
                    <p>Generated by Playwright Accessibility Testing Suite</p>
                    <p>Reports are organized by test suite and analysis type</p>
                </div>
            </body>
        </html>
        `

  fs.writeFileSync(path.join(reportDirectory, 'index.html'), html)
}
