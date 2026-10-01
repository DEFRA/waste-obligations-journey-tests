import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clickAndWaitForNavigation,
  selectAndWaitForNavigation
} from '../pages/prns-list-page.js'

// A minimal fake `page` that models only what these helpers use: a current
// URL, `waitForURL(predicate)` resolving on a future URL change (not the
// current one), and a `waitForLoadState` that - like the real Playwright
// method - resolves immediately once called.
function createFakePage(initialUrl) {
  let currentUrl = new URL(initialUrl)
  const waiters = []

  return {
    url: () => currentUrl.toString(),
    navigateTo(url) {
      currentUrl = new URL(url, currentUrl)
      for (let index = waiters.length - 1; index >= 0; index--) {
        if (waiters[index].predicate(currentUrl)) {
          const [waiter] = waiters.splice(index, 1)
          waiter.resolve()
        }
      }
    },
    waitForURL: (predicate) =>
      new Promise((resolve) => {
        if (predicate(currentUrl)) {
          resolve()
          return
        }
        waiters.push({ predicate, resolve })
      }),
    waitForLoadState: async () => {}
  }
}

// A fake `<select>` locator. `selectOption` resolves immediately - as the
// real one does, once the value is set and the change event dispatched - and
// separately schedules the resulting page navigation `navigateAfterMs` later,
// unawaited, modelling the real network round trip a change handler starts.
function createFakeSelect({
  page,
  options,
  initialValue,
  navigateAfterMs,
  buildUrl
}) {
  let value = initialValue

  return {
    locator: (_selector, { hasText: label }) => ({
      getAttribute: async () =>
        options.find((option) => option.label === label)?.value
    }),
    inputValue: async () => value,
    selectOption: async ({ label }) => {
      const option = options.find((option) => option.label === label)
      value = option.value
      setTimeout(() => page.navigateTo(buildUrl(option.value)), navigateAfterMs)
      return [option.value]
    }
  }
}

function createFakeLink({ page, href, navigateAfterMs }) {
  return {
    getAttribute: async () => href,
    click: async () => {
      setTimeout(() => page.navigateTo(href), navigateAfterMs)
    }
  }
}

const SORT_URL = 'https://example.test/producer/org-1/prns?year=2026'
const sortUrlFor = (value) => `${SORT_URL}&sort=${value}`

test('selectAndWaitForNavigation waits for a delayed navigation instead of resolving on the old URL', async () => {
  const page = createFakePage(SORT_URL)
  const select = createFakeSelect({
    page,
    options: [
      { label: 'Date issued (newest first)', value: 'IssuedAtDescending' },
      { label: 'Tonnage: (heaviest first)', value: 'TonnageDescending' }
    ],
    initialValue: 'IssuedAtDescending',
    navigateAfterMs: 50,
    buildUrl: sortUrlFor
  })

  const before = page.url()
  const start = Date.now()
  await selectAndWaitForNavigation(
    page,
    select,
    'Tonnage: (heaviest first)',
    'sort'
  )
  const elapsed = Date.now() - start

  assert.ok(
    elapsed >= 40,
    `expected to wait for the delayed navigation (waited ${elapsed}ms)`
  )
  assert.notEqual(page.url(), before)
  assert.equal(
    new URL(page.url()).searchParams.get('sort'),
    'TonnageDescending'
  )
})

test('selectAndWaitForNavigation resolves without waiting when the option is already selected', async () => {
  const page = createFakePage(sortUrlFor('IssuedAtDescending'))
  const select = createFakeSelect({
    page,
    options: [
      { label: 'Date issued (newest first)', value: 'IssuedAtDescending' }
    ],
    initialValue: 'IssuedAtDescending',
    // Re-selecting the active option fires no change event in the real
    // browser, so no navigation ever happens; a huge delay here proves the
    // helper doesn't wait for one.
    navigateAfterMs: 10_000,
    buildUrl: sortUrlFor
  })

  const start = Date.now()
  await selectAndWaitForNavigation(
    page,
    select,
    'Date issued (newest first)',
    'sort'
  )
  const elapsed = Date.now() - start

  assert.ok(
    elapsed < 1000,
    `expected no navigation wait when re-selecting the active option (waited ${elapsed}ms)`
  )
})

test('demonstrates the fixed race: racing selectOption against waitForLoadState resolved before the delayed navigation', async () => {
  const page = createFakePage(SORT_URL)
  const select = createFakeSelect({
    page,
    options: [
      { label: 'Tonnage: (heaviest first)', value: 'TonnageDescending' }
    ],
    initialValue: 'IssuedAtDescending',
    navigateAfterMs: 50,
    buildUrl: sortUrlFor
  })
  const before = page.url()

  // The pattern this fix replaces: `waitForLoadState('networkidle')` checks
  // the current (already idle) document and resolves immediately, so racing
  // it against the triggering action resolves before the real navigation.
  await Promise.all([
    page.waitForLoadState('networkidle'),
    select.selectOption({ label: 'Tonnage: (heaviest first)' })
  ])

  assert.equal(
    page.url(),
    before,
    'old pattern should resolve before the delayed navigation lands'
  )
})

test('clickAndWaitForNavigation waits for a delayed navigation to the link target', async () => {
  const page = createFakePage(sortUrlFor('TonnageDescending'))
  const link = createFakeLink({
    page,
    href: '/producer/org-1/prns?year=2026',
    navigateAfterMs: 50
  })

  const start = Date.now()
  await clickAndWaitForNavigation(page, link)
  const elapsed = Date.now() - start

  assert.ok(
    elapsed >= 40,
    `expected to wait for the delayed navigation (waited ${elapsed}ms)`
  )
  assert.equal(page.url(), 'https://example.test/producer/org-1/prns?year=2026')
})

test('clickAndWaitForNavigation resolves without waiting when already at the link target', async () => {
  const targetUrl = 'https://example.test/producer/org-1/prns?year=2026'
  const page = createFakePage(targetUrl)
  const link = createFakeLink({
    page,
    href: '/producer/org-1/prns?year=2026',
    navigateAfterMs: 10_000
  })

  const start = Date.now()
  await clickAndWaitForNavigation(page, link)
  const elapsed = Date.now() - start

  assert.ok(
    elapsed < 1000,
    `expected no navigation wait when already at the target URL (waited ${elapsed}ms)`
  )
})
