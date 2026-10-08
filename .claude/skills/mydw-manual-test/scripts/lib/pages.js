'use strict'

// Locators for the RPD (epr-packaging-frontend) Multi-Year / December Waste screens, verified against the local
// stack. Routes are under /report-data. The selected obligation year is held in session, not the URL.

const home = {
  manageObligationsLink(page) {
    return page.getByRole('link', { name: /^manage recycling obligations$/i })
  },
  // Flag OFF variant of the tile.
  legacyObligationsLink(page) {
    return page.getByRole('link', {
      name: /^manage your \d{4} recycling obligations$/i
    })
  },
  searchAllLink(page) {
    return page.getByRole('link', { name: /^search all prns and perns$/i })
  },
  tile(page) {
    return page
      .locator('.govuk-grid-row, .govuk-card, section, div')
      .filter({
        has: page.getByRole('heading', {
          name: /manage recycling obligations/i
        })
      })
      .last()
  }
}

const chooseYear = {
  path: '/report-data/choose-your-recycling-obligations-year',
  heading(page) {
    return page.getByRole('heading', { level: 1, name: /^choose a year$/i })
  },
  radio(page, year) {
    return page.getByRole('radio', { name: String(year), exact: true })
  },
  radios(page) {
    return page.locator('input[type=radio][name=SelectedYear]')
  },
  continue(page) {
    return page.getByRole('button', { name: /^(continue|parhau)$/i })
  },
  errorSummary(page) {
    return page.locator('.govuk-error-summary')
  },
  async choose(page, year) {
    await page.goto(chooseYear.path)
    await chooseYear.radio(page, year).check()
    await chooseYear.continue(page).click()
    await page.waitForLoadState('domcontentloaded')
  }
}

const obligations = {
  path: '/report-data/manage-your-recycling-obligations',
  heading(page, year) {
    return page.getByRole('heading', {
      level: 1,
      name: new RegExp(
        `manage your ${year ?? '\\d{4}'} recycling obligations`,
        'i'
      )
    })
  },
  acceptOrRejectLink(page) {
    return page
      .getByRole('link', { name: /^accept or reject prns and perns$/i })
      .first()
  },
  searchLink(page) {
    return page.getByRole('link', { name: /^search prns and perns$/i }).first()
  },
  csvLink(page) {
    return page.locator('a[href$="download-prns-csv"]').first()
  },
  progressTable(page) {
    return page.locator('main table').first()
  },
  glassTable(page) {
    return page.locator('main table').nth(1)
  },
  // Link text carries hidden "<material> recycling obligation page" text, so match on href (e.g. Glass, Paper, GlassRemelt).
  materialLink(page, slug) {
    return page
      .locator(`main a[href$="/manage-your-recycling-obligations/${slug}"]`)
      .first()
  },
  // Text blocks (p / li) of the "How to meet your recycling obligations" section, up to the progress table,
  // plus the December waste details box (summary text and whether it is open), if present.
  async readHowToMeet(page) {
    return page.evaluate(() => {
      const clean = (t) => t.replace(/\s+/g, ' ').trim()
      const h2 = [...document.querySelectorAll('main h2')].find(
        (h) => clean(h.innerText) === 'How to meet your recycling obligations'
      )
      if (!h2) return null
      const lines = []
      let details = null
      for (let el = h2.nextElementSibling; el; el = el.nextElementSibling) {
        if (el.matches('table') || el.querySelector('table')) break
        const d = el.matches('details') ? el : el.querySelector('details')
        if (d) {
          details = {
            summary: clean(d.querySelector('summary').innerText),
            open: d.open,
            lines: [...d.querySelectorAll('p, li')]
              .map((b) => clean(b.textContent))
              .filter(Boolean)
          }
          continue
        }
        const blocks = el.matches('p, li')
          ? [el]
          : [...el.querySelectorAll('p, li')]
        for (const b of blocks)
          if (clean(b.innerText)) lines.push(clean(b.innerText))
      }
      return { lines, details }
    })
  },
  // Reads the progress grid into { material: { toMeet, awaiting, accepted, outstanding, status } }.
  async readGrid(page) {
    return obligations.progressTable(page).evaluate((t) => {
      const out = {}
      for (const r of t.querySelectorAll('tbody tr, tfoot tr')) {
        const cells = [...r.children].map((c) =>
          c.innerText.replace(/\s+/g, ' ').trim()
        )
        const name = (
          r.querySelector('a') ? r.querySelector('a').innerText : cells[0]
        )
          .replace(/recycling obligation page/i, '')
          .trim()
        const [, toMeet, awaiting, accepted, outstanding, status] = cells
        out[name] = { toMeet, awaiting, accepted, outstanding, status }
      }
      return out
    })
  }
}

const prnList = {
  path: '/report-data/view-awaiting-acceptance-alt',
  heading(page) {
    return page.getByRole('heading', {
      level: 1,
      name: /^accept or reject prns and perns$/i
    })
  },
  row(page, prnNumber) {
    return page.locator('main table tbody tr').filter({
      has: page.getByRole('link', { name: new RegExp(`^${prnNumber}`) })
    })
  },
  prnLink(page, prnNumber) {
    return page.getByRole('link', { name: new RegExp(`^${prnNumber}`) }).first()
  },
  checkbox(page, prnNumber) {
    return page.getByRole('checkbox', {
      name: new RegExp(`(^|\\s)${prnNumber.replace(/[-]/g, '\\-')}$`)
    })
  },
  checkboxes(page) {
    return page.locator('main input[type=checkbox]')
  },
  acceptSelected(page) {
    return page.getByRole('button', {
      name: /^accept selected prns and perns$/i
    })
  },
  flashTags(page) {
    return page.locator('tr.december-waste-flash-row .flash-container--blue')
  },
  sortSelect(page) {
    return page.locator('main select').first()
  }
}

const search = {
  path: '/report-data/view-awaiting-acceptance',
  heading(page) {
    return page.getByRole('heading', {
      level: 1,
      name: /search prns and perns/i
    })
  }
}

const prn = {
  path(id) {
    return `/report-data/selected-prn/${id}`
  },
  heading(page) {
    return page.getByRole('heading', {
      level: 1,
      name: /packaging (waste )?(export )?recycling note/i
    })
  },
  acceptLink(page) {
    return page.getByRole('link', { name: /^accept this (prn|pern)$/i })
  },
  rejectLink(page) {
    return page.getByRole('link', { name: /^reject this (prn|pern)$/i })
  },
  decemberWarning(page) {
    return page.locator('.govuk-warning-text')
  },
  acceptedTowards(page) {
    return page.getByText(/accepted towards \d{4} recycling obligations/i)
  }
}

const chooseAcceptanceYear = {
  path(id) {
    return `/report-data/choose-acceptance-year/${id}`
  },
  heading(page) {
    return page.getByRole('heading', {
      level: 1,
      name: /which year.s recycling obligations do you want to accept/i
    })
  },
  radio(page, year) {
    return page.getByRole('radio', { name: String(year), exact: true })
  },
  radios(page) {
    return page.locator('input[type=radio][name=SelectedYear]')
  },
  continue(page) {
    return page.getByRole('button', { name: /^(continue|parhau)$/i })
  }
}

const acceptConfirm = {
  path(id) {
    return `/report-data/accept-prn/${id}`
  },
  question(page) {
    return page.getByRole('heading', {
      name: /accept this (prn|pern) towards your \d{4} recycling obligations/i
    })
  },
  yes(page) {
    return page.getByRole('button', { name: /^yes, accept$/i })
  },
  noGoBack(page) {
    return page.getByRole('link', { name: /^no, go back$/i })
  }
}

const accepted = {
  banner(page) {
    return page.locator('.govuk-notification-banner')
  },
  bannerTitle(page) {
    return page.getByRole('heading', {
      name: /you accepted this (prn|pern) towards your \d{4} recycling obligations/i
    })
  },
  moreLink(page) {
    return page.getByRole('link', {
      name: /^accept or reject more prns and perns$/i
    })
  },
  progressLink(page) {
    return page.getByRole('link', {
      name: /^view recycling obligations progress$/i
    })
  }
}

const bulk = {
  reviewHeading(page) {
    return page.getByRole('heading', {
      level: 1,
      name: /^review your selection before accepting$/i
    })
  },
  removeLinks(page) {
    return page.getByRole('link', { name: /^remove from selection$/i })
  },
  // NB: on the review page this button commits the acceptance immediately (POST confirm-accept-bulk).
  accept(page) {
    return page.getByRole('button', { name: /^accept$/i })
  },
  panelHeading(page) {
    return page.locator('.govuk-panel--confirmation h1, main h1').first()
  },
  progressLink(page) {
    return page.getByRole('link', {
      name: /^view recycling obligations progress$/i
    })
  }
}

const reject = {
  path(id) {
    return `/report-data/reject-prn/${id}`
  },
  question(page) {
    return page.getByRole('heading', { name: /^reject this (prn|pern)\?$/i })
  },
  yes(page) {
    return page.getByRole('button', { name: /^yes, reject$/i })
  },
  noGoBack(page) {
    return page.getByRole('link', { name: /^no, go back$/i })
  }
}

// Reads every page of a PRN list (10 rows per page, ?page=N) into [{ num, id, cb, flash, cells, page }].
async function readListRows(page, listPath = prnList.path, query = '') {
  const out = []
  const seen = new Set()
  for (let n = 1; n <= 20; n++) {
    await page.goto(`${listPath}?${query ? `${query}&` : ''}page=${n}`)
    const rows = await page
      .locator('main table tbody tr:not(.december-waste-flash-row)')
      .evaluateAll((rs) =>
        rs.map((r) => {
          const a = r.querySelector('a[href*="selected-prn"]')
          const next = r.nextElementSibling
          return {
            num: a
              ? a.innerText.replace(/PRN or PERN number/i, '').trim()
              : '?',
            id: a ? a.getAttribute('href').split('/').pop() : null,
            cb: !!r.querySelector('input[type=checkbox]'),
            flash:
              next && next.classList.contains('december-waste-flash-row')
                ? next.innerText.trim()
                : '',
            cells: [...r.children].map((c) =>
              c.innerText.replace(/\s+/g, ' ').trim()
            )
          }
        })
      )
    const fresh = rows.filter((r) => !seen.has(r.num))
    if (!fresh.length) break
    for (const r of fresh) {
      seen.add(r.num)
      out.push({ ...r, page: n })
    }
    if (rows.length < 10) break
  }
  return out
}

// Find a PRN's GUID from the accept/reject or search list by its PRN number.
async function prnIdFromList(page, prnNumber, listPath = prnList.path) {
  if (!page.url().includes(listPath)) await page.goto(listPath)
  const href = await prnList
    .prnLink(page, prnNumber)
    .getAttribute('href')
    .catch(() => null)
  return href ? href.split('/').pop() : null
}

module.exports = {
  home,
  chooseYear,
  obligations,
  prnList,
  search,
  prn,
  chooseAcceptanceYear,
  acceptConfirm,
  accepted,
  bulk,
  reject,
  prnIdFromList,
  readListRows
}
