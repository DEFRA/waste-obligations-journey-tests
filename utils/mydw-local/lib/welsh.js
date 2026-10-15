/* eslint-env browser -- textRuns runs inside page.evaluate */
// Welsh checks (MO-575): read every text run a user could see or hear on the English and the Welsh page, and list
// the Welsh page's runs that are still English page copy.
//
// Rules agreed with the tester (12 Oct 2026):
//   - values from the database (material names, issuer names, addresses, notes, organisation and scheme names) are
//     shown as stored, not translated;
//   - the December waste "Yes"/"No" value, the "Warning" assistive text and screen-reader-only labels are noted, not
//     counted ("beta" is the same in Welsh).

// Visible text runs plus the page title and aria-label/alt/title/placeholder/button values, each with its zone.
async function textRuns(page) {
  return page.evaluate(() => {
    const out = []
    const clean = (t) =>
      String(t || '')
        .replace(/\s+/g, ' ')
        .trim()
    const zone = (el) => {
      if (el.closest('.govuk-cookie-banner, #cookie-banner, [class*=cookie]'))
        return 'cookie banner'
      if (
        el.closest(
          'header, .govuk-header, .govuk-service-navigation, .govuk-phase-banner, .govuk-skip-link'
        )
      )
        return 'header'
      if (el.closest('footer, .govuk-footer')) return 'footer'
      return 'main'
    }
    const hidden = (el) => {
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        if (e.hidden || e.getAttribute('aria-hidden') === 'true') return true
        const s = getComputedStyle(e)
        if (s.display === 'none' || s.visibility === 'hidden') return true
      }
      return false
    }
    out.push({ text: clean(document.title), where: 'page title' })
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    )
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement
      if (
        !el ||
        ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName)
      )
        continue
      const t = clean(n.textContent)
      if (!t || hidden(el)) continue
      out.push({
        text: t,
        where:
          zone(el) +
          (el.closest('.govuk-visually-hidden') ? ' (screen reader only)' : '')
      })
    }
    for (const el of document.querySelectorAll(
      '[aria-label],[alt],[title],[placeholder],input[type=submit][value]'
    )) {
      if (hidden(el)) continue
      for (const a of ['aria-label', 'alt', 'title', 'placeholder', 'value']) {
        if (a === 'value' && el.type !== 'submit') continue
        const t = clean(el.getAttribute(a))
        if (t) out.push({ text: t, where: `${zone(el)} (${a})` })
      }
    }
    return out
  })
}

const ALLOWED = [
  /^[\d\s.,:/\-–—£%()+×#*|·•]+$/,
  /^[A-Z0-9]{2,}(-[A-Z0-9]+)+$/i, // note numbers such as DP-PRN-003-RREPW
  /^[A-Z]{2}\d{5,}$/, // ER2600124
  /^(PRN|PERN|PRNs|PERNs|GOV\.UK|RPD|EPR|Cymraeg|English|©)$/i,
  /^[\w.+-]+@[\w.-]+$/
]
const ENGLISH_WORDS =
  /\b(the|and|your|you|of|with|this|these|accept|accepted|reject|rejected|recycling|obligations?|year|years|select|selected|continue|back|search|awaiting|acceptance|tonnes|issued|download|view|choose|which|will|towards|from|have|has|been|not|available|yet|before|after|more|page|sign out)\b/i
const RESOURCE_KEY =
  /(^[A-Z][A-Za-z0-9]+(\.[A-Z][A-Za-z0-9_]+)+$)|(\{\d+\})|(\[\[)|(\]\])|(^[A-Z][a-z]+([A-Z][a-z0-9]+){2,}$)/
// Noted, not counted (agreed): see the header.
const NOTED =
  /^(Yes|No|Warning|Error:|results|Page \d+|main|confirmation|Menu|Show or hide menu|beta)$/

const escapeRe = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Splits the Welsh page's runs into English page copy (`copy`), agreed exceptions (`noted`) and database values
// (`record`). `record` is a Set of strings stored in the database.
function englishLeft(cyRuns, enRuns, record = new Set()) {
  const en = new Set(enRuns.map((r) => r.text))
  const values = [...record].filter((v) => v.length > 3)
  // An exact match counts whatever its length; only values longer than 3 characters are stripped from sentences.
  const all = [...record].map((v) => v.toLowerCase())
  const isRecord = (t) => all.includes(t.toLowerCase())
  const strip = (t) =>
    values.reduce(
      (acc, v) => acc.replace(new RegExp(escapeRe(v), 'gi'), ' '),
      t
    )
  const out = { copy: [], noted: [], record: [] }
  const seen = new Set()
  for (const r of cyRuns) {
    const key = `${r.where}|${r.text}`
    if (seen.has(key) || ALLOWED.some((a) => a.test(r.text))) continue
    seen.add(key)
    if (RESOURCE_KEY.test(r.text)) {
      out.copy.push({ ...r, why: 'resource key or placeholder' })
      continue
    }
    const rest = strip(r.text)
    if (
      isRecord(r.text) ||
      (rest !== r.text && !ENGLISH_WORDS.test(rest) && !en.has(r.text))
    ) {
      if (en.has(r.text)) out.record.push(r)
      continue
    }
    const english =
      en.has(r.text) && /[a-z]{3,}/i.test(rest)
        ? 'same as the English page'
        : (rest.match(ENGLISH_WORDS) || [])[0] &&
          `English word "${rest.match(ENGLISH_WORDS)[0]}"`
    if (!english) continue
    if (NOTED.test(r.text)) out.noted.push({ ...r, why: english })
    else out.copy.push({ ...r, why: english })
  }
  return out
}

// Reads one page in English then Welsh through the service's language switch. `load(page)` (optional) runs after
// each switch to reach the page state; returns { en, cy, left }.
async function bothLanguages(page, setLanguage, path, record, load) {
  const read = async (lang) => {
    await setLanguage(page, lang, path)
    await page.goto(path)
    if (load) await load(page)
    await page.waitForLoadState('domcontentloaded')
    const h1 = (
      await page
        .locator('main h1, main h2')
        .first()
        .innerText()
        .catch(() => '')
    )
      .replace(/\s+/g, ' ')
      .trim()
    return { url: new URL(page.url()).pathname, h1, runs: await textRuns(page) }
  }
  const en = await read('en')
  const cy = await read('cy')
  return { en, cy, left: englishLeft(cy.runs, en.runs, record) }
}

// String values held on the organisation's PRN rows (prn-db connection with allColumns), plus extra names.
async function recordValues(prnDb, orgIds, extra = []) {
  const out = new Set(extra.filter(Boolean))
  if (prnDb && prnDb.available && prnDb.allColumns) {
    for (const r of await prnDb.allColumns(orgIds))
      for (const v of Object.values(r))
        if (typeof v === 'string' && /[a-z]{3,}/i.test(v))
          out.add(v.replace(/\s+/g, ' ').trim())
  }
  return out
}

module.exports = { textRuns, englishLeft, bothLanguages, recordValues, NOTED }
