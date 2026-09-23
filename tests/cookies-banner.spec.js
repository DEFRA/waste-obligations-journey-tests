import { expect, test } from '../fixtures/pages.fixture.js'
import {
  getPublicFrontendUrl,
  getWasteObligationsFrontendBaseUrl
} from '../utils/journey-entry-point.js'
import { skipUnlessAnalyticsEnabled } from '../utils/environment-features.js'
import {
  CONSENT_COOKIE_NAME,
  expectedAnalyticsCookiePath,
  failJsonCookiePosts,
  dispatchPersistedPageshow,
  getDataLayerEntries,
  getGaCookieNames,
  getGaCookies,
  interceptAnalyticsTraffic,
  isCookieFormPost,
  readAnalyticsIds,
  readConsentPolicyFromPage,
  servicePath,
  setTestGaCookies
} from '../utils/analytics.js'

// Cookie consent is a public, pre-auth journey. Do not reuse the DP session
// from auth.setup.js: visiting cookies?lang=cy persists locale on that session
// and the later CSOC specs then fail looking for English headings.
test.use({ storageState: { cookies: [], origins: [] } })

async function openPublicFrontend(page, path, search) {
  skipUnlessAnalyticsEnabled()
  await page.goto(getPublicFrontendUrl(path, search))
}

test.describe('Cookie banner and cookies page', () => {
  // Cookie consent is owned by the waste-obligations frontend. In Packaging
  // mode Playwright's baseURL is Azure, so these tests open the CDP frontend
  // through WASTE_OBLIGATIONS_FRONTEND_BASE_URL.

  test.beforeEach(async ({ page }) => {
    await interceptAnalyticsTraffic(page)
  })

  test('does not initialize analytics before consent and initializes them without a reload on accept', async ({
    page
  }) => {
    await openPublicFrontend(page, '/signed-out')
    const { gtmKey, measurementId } = await readAnalyticsIds(page)

    expect(await readConsentPolicyFromPage(page)).toBeNull()
    await expect(
      page.locator('script[src*="googletagmanager.com"]')
    ).toHaveCount(0)

    await page.getByRole('button', { name: 'Accept analytics cookies' }).click()

    await expect(
      page.getByText('You’ve accepted analytics cookies.')
    ).toBeVisible()
    if (gtmKey) {
      await expect(
        page.locator(`script[src*="gtm.js?id=${gtmKey}"]`)
      ).toHaveCount(1)
    }
    if (measurementId) {
      await expect(
        page.locator(`script[src*="gtag/js?id=${measurementId}"]`)
      ).toHaveCount(1)
    }

    const dataLayer = await getDataLayerEntries(page)
    if (measurementId) {
      expect(dataLayer).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'arguments',
            values: ['config', measurementId]
          })
        ])
      )
      expect(
        dataLayer.some(
          (entry) => entry.kind === 'arguments' && entry.values[0] === 'js'
        )
      ).toBe(true)
    }
    expect(await readConsentPolicyFromPage(page)).toEqual(
      expect.objectContaining({ confirmed: true, analytics: true })
    )
  })

  test('does not initialize analytics after rejection', async ({ page }) => {
    await openPublicFrontend(page, '/signed-out')

    await page.getByRole('button', { name: 'Reject analytics cookies' }).click()

    await expect(
      page.getByText('You’ve rejected analytics cookies.')
    ).toBeVisible()
    await expect(
      page.locator('script[src*="googletagmanager.com"]')
    ).toHaveCount(0)
  })

  test('failed accept and reject XHRs save the selected preference and return to the page', async ({
    page
  }) => {
    await openPublicFrontend(page, '/signed-out')

    await expect(page.locator('form[action$="/cookies"]')).toHaveAttribute(
      'action',
      servicePath(getWasteObligationsFrontendBaseUrl(), 'cookies')
    )
    await expect(page.locator('input[name="returnUrl"]')).toHaveValue(
      /\/signed-out$/
    )

    await failJsonCookiePosts(page)
    const acceptFallback = page.waitForRequest((request) =>
      isCookieFormPost(request, 'true')
    )

    await page.getByRole('button', { name: 'Accept analytics cookies' }).click()
    await acceptFallback

    await expect(page).toHaveURL(/\/signed-out\/?$/)
    expect(await readConsentPolicyFromPage(page)).toEqual(
      expect.objectContaining({ confirmed: true, analytics: true })
    )
    await expect(
      page.getByRole('button', { name: 'Accept analytics cookies' })
    ).toHaveCount(0)

    await page.goto(getPublicFrontendUrl('/cookies'))
    await expect(page.getByRole('radio', { name: 'Yes' })).toBeChecked()

    await page.context().clearCookies({
      name: CONSENT_COOKIE_NAME
    })
    await page.goto(getPublicFrontendUrl('/signed-out'))
    const rejectFallback = page.waitForRequest((request) =>
      isCookieFormPost(request, 'false')
    )
    await page.getByRole('button', { name: 'Reject analytics cookies' }).click()
    await rejectFallback

    await expect(page).toHaveURL(/\/signed-out\/?$/)
    expect(await readConsentPolicyFromPage(page)).toEqual(
      expect.objectContaining({ confirmed: true, analytics: false })
    )
    await page.goto(getPublicFrontendUrl('/cookies'))
    await expect(page.getByRole('radio', { name: 'No' })).toBeChecked()
  })

  test('history restoration keeps GA cookies while consent remains accepted', async ({
    page
  }) => {
    await openPublicFrontend(page, '/signed-out')
    const { measurementId, ga4CookieName } = await readAnalyticsIds(page)
    await page.getByRole('button', { name: 'Accept analytics cookies' }).click()
    await expect(
      page.getByText('You’ve accepted analytics cookies.')
    ).toBeVisible()
    await page.reload()
    await setTestGaCookies(page)

    const expectedNames = ga4CookieName ? ['_ga', ga4CookieName] : ['_ga']
    expect(await getGaCookieNames(page)).toEqual(
      expect.arrayContaining(expectedNames)
    )

    await dispatchPersistedPageshow(page)

    expect(await getGaCookieNames(page)).toEqual(
      expect.arrayContaining(expectedNames)
    )
    expect(await readConsentPolicyFromPage(page)).toEqual(
      expect.objectContaining({ confirmed: true, analytics: true })
    )
    if (measurementId) {
      await expect(
        page.locator(`script[src*="gtag/js?id=${measurementId}"]`)
      ).toHaveCount(1)
    }
  })

  test('history restoration after rejection clears GA cookies and does not restart analytics', async ({
    page
  }) => {
    await openPublicFrontend(page, '/signed-out')
    await page.getByRole('button', { name: 'Accept analytics cookies' }).click()
    await expect(
      page.getByText('You’ve accepted analytics cookies.')
    ).toBeVisible()
    await page.reload()
    await setTestGaCookies(page)

    await page.goto(getPublicFrontendUrl('/cookies'))
    await page.getByRole('radio', { name: 'No' }).check()
    await page.getByRole('button', { name: 'Save cookie settings' }).click()
    await setTestGaCookies(page)

    const restored = page.waitForEvent('load')
    await dispatchPersistedPageshow(page)
    await restored

    await expect.poll(async () => getGaCookieNames(page)).toEqual([])
    expect(await readConsentPolicyFromPage(page)).toEqual(
      expect.objectContaining({ confirmed: true, analytics: false })
    )
    await expect(
      page.locator('script[src*="googletagmanager.com"]')
    ).toHaveCount(0)
  })

  test('scopes Google Analytics cookies to the public service path', async ({
    page
  }) => {
    const expectedPath = expectedAnalyticsCookiePath(
      getWasteObligationsFrontendBaseUrl()
    )

    await openPublicFrontend(page, '/signed-out')
    await page.getByRole('button', { name: 'Accept analytics cookies' }).click()
    await expect(
      page.getByText('You’ve accepted analytics cookies.')
    ).toBeVisible()
    await page.reload()
    await setTestGaCookies(page)

    await expect(page.locator('.js-cookie-consent-config')).toHaveAttribute(
      'data-analytics-cookie-path',
      expectedPath
    )
    expect(await page.content()).toContain(
      `gtag('set',{'cookie_path':'${expectedPath}'})`
    )

    const gaCookie = (await getGaCookies(page)).find(
      (cookie) => cookie.name === '_ga'
    )

    expect(gaCookie?.path).toBe(expectedPath)
  })

  test('shows analytics cookies and settings on the cookies page', async ({
    page
  }) => {
    await openPublicFrontend(page, '/cookies')
    const { ga4CookieName } = await readAnalyticsIds(page)

    const main = page.locator('#main-content')

    expect(await readConsentPolicyFromPage(page)).toBeNull()
    await expect(
      main.getByRole('heading', { name: 'Analytics cookies', level: 2 })
    ).toBeVisible()
    await expect(main.getByText('_gid', { exact: true })).toBeVisible()
    if (ga4CookieName) {
      await expect(main.getByText(ga4CookieName)).toBeVisible()
    }
    await expect(main.getByText('4 hours', { exact: true })).toBeVisible()
    await expect(main.getByText('24 hours', { exact: true })).toBeVisible()
    await expect(
      main.getByRole('heading', {
        name: 'Change your cookie settings',
        level: 2
      })
    ).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Yes' })).not.toBeChecked()
    await expect(page.getByRole('radio', { name: 'No' })).not.toBeChecked()
  })

  test('translates the session cookie expiry on the Welsh cookies page', async ({
    page
  }) => {
    await openPublicFrontend(page, '/cookies', 'lang=cy')

    const main = page.locator('#main-content')

    await expect(main.getByText('4 awr', { exact: true })).toBeVisible()
    await expect(main.getByText('24 awr', { exact: true })).toBeVisible()
    await expect(main.getByText('4 hours')).toHaveCount(0)
  })
})
