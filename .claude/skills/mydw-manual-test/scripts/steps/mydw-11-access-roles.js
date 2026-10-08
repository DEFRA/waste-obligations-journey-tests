'use strict'

const pages = require('../lib/pages')
const { ORG_TYPES } = require('../config')
const { signInStep, DEFAULT_PRNS } = require('./_common')

// Role permissions (run with --role BU and --role DP) and cross-organisation access to PRN routes. Read-only.

module.exports = {
  id: 'MYDW-11',
  title: 'Roles and cross-organisation access',
  buildSteps: async (ctx) => {
    const own = ctx.db
      .listPrns(ctx.user.orgExternalId)
      .find((p) => p.PrnNumber === DEFAULT_PRNS[ctx.orgType].dw)
    const otherType = ctx.orgType === 'DRP' ? 'CS' : 'DRP'
    const other = ctx.db
      .listPrns(ORG_TYPES[otherType].orgExternalId)
      .find((p) => p.PrnNumber === DEFAULT_PRNS[otherType].dw)
    const isBasic = ctx.role === 'BU'
    const probe = (id, title, url, expected) => ({
      id,
      title,
      action: async ({ page }) => {
        const res = await page.goto(url)
        const status = res ? res.status() : '?'
        const h1 = (
          await page
            .locator('h1')
            .first()
            .innerText()
            .catch(() => '')
        ).trim()
        return `HTTP ${status} — "${await page.title()}" — h1 "${h1}"`
      },
      expected
    })
    return [
      signInStep('01'),
      {
        id: '02',
        title: `Tile and own PRN as ${ctx.user.roleLabel}`,
        action: async ({ page }) => {
          const tile = await pages.home.manageObligationsLink(page).count()
          await page.goto(pages.prn.path(own.ExternalId))
          return `tile: ${tile > 0}; Accept: ${(await pages.prn.acceptLink(page).count()) > 0}; Reject: ${(await pages.prn.rejectLink(page).count()) > 0}`
        },
        expected: isBasic
          ? 'Check against the ticket ACs. On the local stack a Basic User sees Accept/Reject (the PRN controllers have no role check — only the CSoC link on the obligations page is limited to Approved/Delegated). FAIL only if the ticket requires PRN acceptance to be restricted.'
          : `${ctx.user.roleLabel} sees the tile and Accept/Reject on actionable PRNs.`
      },
      probe(
        '03',
        'Own PRN — direct GET accept-prn',
        `/report-data/accept-prn/${own.ExternalId}`,
        'Year page (two-year DW PRN) or confirmation page — must match what the Accept button leads to. Do not click Yes.'
      ),
      probe(
        '04',
        'Own PRN — direct GET choose-acceptance-year',
        pages.chooseAcceptanceYear.path(own.ExternalId),
        'Year page when the PRN offers two years; otherwise a redirect to the confirmation page.'
      ),
      probe(
        '05',
        `Other org's PRN (${other.PrnNumber}) — selected-prn`,
        pages.prn.path(other.ExternalId),
        "Handled not-found/forbidden page (404/403). Must NOT show the other organisation's PRN. Known on local stack: HTTP 500 unhandled exception (no data shown) — FAIL as error handling."
      ),
      probe(
        '06',
        `Other org's PRN — choose-acceptance-year`,
        pages.chooseAcceptanceYear.path(other.ExternalId),
        'Handled 404/403. Known on local stack: HTTP 500 "An unhandled exception occurred" — FAIL.'
      ),
      probe(
        '07',
        `Other org's PRN — accept-prn`,
        pages.acceptConfirm.path(other.ExternalId),
        "Handled 404/403; no confirmation page for another organisation's PRN."
      ),
      probe(
        '08',
        'Unknown PRN id — choose-acceptance-year',
        pages.chooseAcceptanceYear.path('00000000-0000-0000-0000-000000000000'),
        'Handled 404 page, not a 500.'
      )
    ]
  }
}
