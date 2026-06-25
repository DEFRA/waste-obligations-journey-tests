import AxeBuilder from '@axe-core/playwright'
import fs from 'fs'
import path from 'path'

const reportDirectory = path.join('./reports')

// Per-scan results captured during the journey. Reset by
// initialiseAccessibilityChecking() and consumed by the report / assert
// helpers below — no global state survives between test runs.
let scans = []

export async function initialiseAccessibilityChecking() {
  if (!fs.existsSync(reportDirectory)) {
    fs.mkdirSync(reportDirectory, { recursive: true })
  }
  scans = []
}

export async function analyseAccessibility(page, suffix) {
  const results = await new AxeBuilder({ page }).analyze()
  scans.push({
    suffix,
    url: page.url(),
    pageTitle: await page.title(),
    violations: results.violations
  })
}

export function generateAccessibilityReports(filePrefix) {
  for (const scan of scans) {
    fs.writeFileSync(
      path.join(reportDirectory, `${scan.suffix}-accessibility.html`),
      renderScanHtml(scan)
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

function buildPerPageSummary() {
  return scans.map((scan) => {
    const count = (impacts) =>
      scan.violations.filter((v) => impacts.includes(v.impact)).length
    return {
      url: scan.url,
      pageTitle: scan.pageTitle,
      critical: count(['critical', 'serious']),
      medium: count(['moderate'])
    }
  })
}

export function assertNoAccessibilityIssues() {
  const summary = buildPerPageSummary()
  const totals = summary.reduce(
    (acc, p) => ({
      critical: acc.critical + p.critical,
      medium: acc.medium + p.medium
    }),
    { critical: 0, medium: 0 }
  )
  if (totals.critical === 0 && totals.medium === 0) return

  const offending = summary
    .filter((p) => p.critical > 0 || p.medium > 0)
    .map(
      (p) =>
        `  - ${p.pageTitle || p.url}: ${p.critical} critical, ${p.medium} medium`
    )
    .join('\n')

  throw new Error(
    `Accessibility violations: ${totals.critical} critical, ${totals.medium} medium ` +
      `(policy: 0 critical and 0 medium).\nPages with issues:\n${offending}\n` +
      `See ./reports/index.html for full detail.`
  )
}

const escapeHtml = (value) =>
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

const IMPACT_ORDER = ['critical', 'serious', 'moderate', 'minor']
const IMPACT_LABEL = {
  critical: 'Critical',
  serious: 'Serious',
  moderate: 'Moderate',
  minor: 'Minor'
}
const IMPACT_COLOUR = {
  critical: '#d4351c',
  serious: '#d4351c',
  moderate: '#f47738',
  minor: '#505a5f'
}

function renderScanHtml(scan) {
  const grouped = IMPACT_ORDER.map((impact) => ({
    impact,
    items: scan.violations.filter((v) => v.impact === impact)
  })).filter((g) => g.items.length > 0)

  const sections =
    grouped.length === 0
      ? '<p class="empty">No axe-core violations detected on this page.</p>'
      : grouped.map(renderImpactSection).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Accessibility report — ${escapeHtml(scan.pageTitle || scan.suffix)}</title>
    <style>
      body { font-family: 'GDS Transport', arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; background: #f8f8f8; color: #0b0c0c; }
      .header { background: #1d70b8; color: white; padding: 20px; border-radius: 8px; margin-bottom: 24px; }
      .header h1 { margin: 0; font-size: 1.6rem; }
      .header p { margin: 6px 0 0 0; opacity: 0.9; word-break: break-all; }
      h2 { margin-top: 28px; font-size: 1.2rem; display: flex; align-items: center; gap: 10px; }
      .impact-chip { padding: 2px 10px; border-radius: 4px; color: white; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; }
      table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #dee2e6; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05); margin-bottom: 16px; }
      th, td { padding: 10px 14px; text-align: left; border-bottom: 1px solid #eee; vertical-align: top; }
      th { background: #f3f3f3; font-size: 0.85rem; text-transform: uppercase; }
      tr:last-child td { border-bottom: none; }
      .rule { font-weight: bold; }
      .help-link { color: #1d70b8; }
      .targets { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85rem; color: #505a5f; white-space: pre-wrap; word-break: break-word; }
      .empty { background: white; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>${escapeHtml(scan.pageTitle || scan.suffix)}</h1>
      <p>${escapeHtml(scan.url)}</p>
    </div>
    ${sections}
  </body>
</html>`
}

function renderImpactSection(group) {
  const colour = IMPACT_COLOUR[group.impact]
  const label = IMPACT_LABEL[group.impact]
  const rows = group.items
    .map((v) => {
      const targets = v.nodes
        .map((n) => (n.target || []).join(' '))
        .filter(Boolean)
        .join('\n')
      return `
        <tr>
          <td class="rule">${escapeHtml(v.id)}<br><span style="font-weight: normal">${escapeHtml(v.description || v.help || '')}</span></td>
          <td><a class="help-link" href="${escapeHtml(v.helpUrl)}" target="_blank" rel="noopener">${escapeHtml(v.help || v.id)}</a></td>
          <td><div class="targets">${escapeHtml(targets)}</div></td>
        </tr>`
    })
    .join('')

  return `
    <h2><span class="impact-chip" style="background:${colour}">${label}</span> ${group.items.length} ${group.items.length === 1 ? 'violation' : 'violations'}</h2>
    <table>
      <thead>
        <tr><th>Rule</th><th>Help</th><th>Targets</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
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
  const totals = { critical: 0, medium: 0 }
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
        medium: Number(page.medium) || 0
      })
      totals.critical += Number(page.critical) || 0
      totals.medium += Number(page.medium) || 0
    }
  }

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
        </div>
        <h2>Per-page issue counts</h2>
        <table class="page-table">
            <thead>
                <tr>
                    <th scope="col">Page</th>
                    <th scope="col">Critical</th>
                    <th scope="col">Medium</th>
                </tr>
            </thead>
            <tbody>
                ${pages
                  .map(
                    (p) => `
                <tr>
                    <td><div class="page-title">${escapeHtml(p.title)}</div><div class="page-url">${escapeHtml(p.url)}</div></td>
                    <td class="num critical">${p.critical}</td>
                    <td class="num medium">${p.medium}</td>
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
                        grid-template-columns: repeat(2, 1fr);
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
                            const displayName = filename
                              .replace('-accessibility.html', '')
                              .replace('.html', '')
                              .replace(/-/g, ' ')
                              .replace(/\b\w/g, (l) => l.toUpperCase())

                            return `
                                <div class="report-card">
                                    <div class="report-type">Page report</div>
                                    <a href="${filename}" class="report-title">${displayName}</a>
                                    <p>Click to view axe-core violations for this page</p>
                                </div>
                            `
                          })
                          .join('')}
                    </div>`
                }

                <div class="footer">
                    <p>Generated by Playwright Accessibility Testing Suite</p>
                    <p>Reports are organized by page; each lists axe-core violations grouped by impact.</p>
                </div>
            </body>
        </html>
        `

  fs.writeFileSync(path.join(reportDirectory, 'index.html'), html)
}
