import { expect, test } from '../fixtures/pages.fixture.js'
import { usesPackagingEntryPoint } from '../utils/journey-entry-point.js'
import {
  TEST_GA4_COOKIE_NAME,
  TEST_GTM_KEY,
  TEST_MEASUREMENT_ID,
  failJsonCookiePosts,
  dispatchPersistedPageshow,
  getDataLayerEntries,
  getGaCookieNames,
  interceptAnalyticsTraffic,
  isCookieFormPost,
  readConsentPolicyFromPage,
  servicePath,
  setTestGaCookies
} from '../utils/analytics.js'

test.describe('Cookie banner and cookies page', () => {
  test.skip(
    usesPackagingEntryPoint(),
    'Cookie consent is owned by the waste-obligations frontend'
  )

  test.beforeEach(async ({ page }) => {
    await interceptAnalyticsTraffic(page)
  })

  test('does not initialize analytics before consent and initializes them without a reload on accept', async ({
    page
  }) => {
    await page.goto('signed-out')

    await expect(
      page.getByRole('button', { name: 'Accept analytics cookies' })
    ).toBeVisible()
    await expect(
      page.locator('script[src*="googletagmanager.com"]')
    ).toHaveCount(0)

    await page.getByRole('button', { name: 'Accept analytics cookies' }).click()

    await expect(
      page.getByText('You’ve accepted analytics cookies.')
    ).toBeVisible()
    await expect(
      page.locator(`script[src*="gtm.js?id=${TEST_GTM_KEY}"]`)
    ).toHaveCount(1)
    await expect(
      page.locator(`script[src*="gtag/js?id=${TEST_MEASUREMENT_ID}"]`)
    ).toHaveCount(1)

    const dataLayer = await getDataLayerEntries(page)
    expect(dataLayer).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'arguments',
          values: ['config', TEST_MEASUREMENT_ID]
        })
      ])
    )
  })

  test('does not initialize analytics after rejection', async ({ page }) => {
    await page.goto('signed-out')

    await page.getByRole('button', { name: 'Reject analytics cookies' }).click()

    await expect(
      page.getByText('You’ve rejected analytics cookies.')
    ).toBeVisible()
    await expect(
      page.locator('script[src*="googletagmanager.com"]')
    ).toHaveCount(0)
  })

  test('failed accept and reject XHRs save the selected preference and return to the page', async ({
    page,
    baseURL
  }) => {
    await page.goto('signed-out')

    await expect(page.locator('form[action$="/cookies"]')).toHaveAttribute(
      'action',
      servicePath(baseURL, 'cookies')
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

    await page.goto('cookies')
    await expect(page.getByRole('radio', { name: 'Yes' })).toBeChecked()

    await page.context().clearCookies({
      name: 'waste-obligations-cookie-policy'
    })
    await page.goto('signed-out')
    const rejectFallback = page.waitForRequest((request) =>
      isCookieFormPost(request, 'false')
    )
    await page.getByRole('button', { name: 'Reject analytics cookies' }).click()
    await rejectFallback

    await expect(page).toHaveURL(/\/signed-out\/?$/)
    expect(await readConsentPolicyFromPage(page)).toEqual(
      expect.objectContaining({ confirmed: true, analytics: false })
    )
    await page.goto('cookies')
    await expect(page.getByRole('radio', { name: 'No' })).toBeChecked()
  })

  test('history restoration keeps GA cookies while consent remains accepted', async ({
    page
  }) => {
    await page.goto('signed-out')
    await page.getByRole('button', { name: 'Accept analytics cookies' }).click()
    await page.reload()
    await setTestGaCookies(page)

    expect(await getGaCookieNames(page)).toEqual(
      expect.arrayContaining(['_ga', TEST_GA4_COOKIE_NAME])
    )

    await Promise.all([
      page.waitForEvent('load'),
      dispatchPersistedPageshow(page)
    ])

    expect(await getGaCookieNames(page)).toEqual(
      expect.arrayContaining(['_ga', TEST_GA4_COOKIE_NAME])
    )
    await expect(
      page.locator(`script[src*="gtag/js?id=${TEST_MEASUREMENT_ID}"]`)
    ).toHaveCount(1)
  })

  test('history restoration after rejection clears GA cookies and does not restart analytics', async ({
    page
  }) => {
    await page.goto('signed-out')
    await page.getByRole('button', { name: 'Accept analytics cookies' }).click()
    await page.reload()

    await page.goto('cookies')
    await page.getByRole('radio', { name: 'No' }).check()
    await page.getByRole('button', { name: 'Save cookie settings' }).click()
    await setTestGaCookies(page)

    await Promise.all([
      page.waitForEvent('load'),
      dispatchPersistedPageshow(page)
    ])

    expect(await getGaCookieNames(page)).toEqual([])
    await expect(
      page.locator('script[src*="googletagmanager.com"]')
    ).toHaveCount(0)
  })

  test('shows analytics cookies and settings on the cookies page', async ({
    page
  }) => {
    await page.goto('cookies')

    const main = page.locator('#main-content')

    await expect(
      main.getByRole('heading', { name: 'Analytics cookies', level: 2 })
    ).toBeVisible()
    await expect(main.getByText(TEST_GA4_COOKIE_NAME)).toBeVisible()
    await expect(
      main.getByRole('heading', {
        name: 'Change your cookie settings',
        level: 2
      })
    ).toBeVisible()
  })
})
