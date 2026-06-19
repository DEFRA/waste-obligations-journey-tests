import fs from 'fs'

// Writes a profile-specific ./index.html that the CDP Portal renders as the
// landing page for a test run. bin/publish-tests.sh runs this after Allure,
// then uploads index.html to the run's S3 root.
//
// Note: the on-disk accessibility folder is ./reports/, but publish-tests.sh
// renames it to accessibility-report/ on S3 — so the relative hrefs below
// (accessibility-report/index.html) match the S3 layout, not the local one.

const profile = process.env.PROFILE || 'e2e'

const ALLURE_CARD = {
  title: 'Allure Test Report',
  type: 'Run Summary',
  href: 'allure-report/index.html',
  description:
    'Detailed test execution results, traces, screenshots, and history.'
}

const ACCESSIBILITY_CARD = {
  title: 'Accessibility Report',
  type: 'WCAG Findings',
  href: 'accessibility-report/index.html',
  description: 'WCAG accessibility analysis by category and guideline.'
}

const SECURITY_CARD = {
  title: 'Security Scan Report',
  type: 'OWASP ZAP',
  href: 'security-report/index.html',
  description: 'OWASP ZAP findings from the proxied security scan.'
}

const cardsByProfile = {
  e2e: [ALLURE_CARD],
  accessibility: [ACCESSIBILITY_CARD, ALLURE_CARD],
  security: [SECURITY_CARD, ALLURE_CARD]
}

const cards = cardsByProfile[profile] || cardsByProfile.e2e

const profileLabel = profile.charAt(0).toUpperCase() + profile.slice(1)

const cardMarkup = cards
  .map(
    (card) => `
                <div class="report-card">
                    <div class="report-type">${card.type}</div>
                    <a href="${card.href}" class="report-title">${card.title}</a>
                    <p>${card.description}</p>
                </div>
            `
  )
  .join('')

const html = `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>EPR Waste Obligations — Test Reports</title>
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
                display: inline-block;
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
        </style>
    </head>
    <body>
        <div class="header">
            <h1>EPR Waste Obligations — Test Reports</h1>
            <p>Profile: ${profileLabel}</p>
            <p>Generated on ${new Date().toLocaleString()}</p>
        </div>

        <div class="reports-grid">
            ${cardMarkup}
        </div>

        <div class="footer">
            <p>Defra DDTS — Waste Obligations Journey Tests</p>
        </div>
    </body>
</html>
`

fs.writeFileSync('index.html', html)
