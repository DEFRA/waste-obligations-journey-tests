export const TEST_GTM_KEY = 'GTM-TEST0001'
export const TEST_MEASUREMENT_ID = 'G-TEST000001'
export const TEST_GA4_COOKIE_NAME = `_ga_${TEST_MEASUREMENT_ID.slice(2)}`
export const CONSENT_COOKIE_NAME = 'waste-obligations-cookie-policy'

export async function interceptAnalyticsTraffic(page) {
  const fulfillEmpty = (route) =>
    route.fulfill({
      status: 204,
      body: ''
    })

  await page.route(/https:\/\/www\.googletagmanager\.com\//, async (route) => {
    const url = route.request().url()

    if (url.includes('/gtag/js')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: 'window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments);};'
      })
      return
    }

    if (url.includes('/gtm.js')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: 'window.dataLayer=window.dataLayer||[];'
      })
      return
    }

    await fulfillEmpty(route)
  })

  await page.route(/google-analytics\.com/, fulfillEmpty)
  await page.route(/analytics\.google\.com/, fulfillEmpty)
}

export async function getDataLayerEntries(page) {
  return page.evaluate(() =>
    (window.dataLayer || []).map((entry) => {
      const isArguments =
        Object.prototype.toString.call(entry) === '[object Arguments]'

      return {
        kind: isArguments
          ? 'arguments'
          : Array.isArray(entry)
            ? 'array'
            : 'object',
        values: isArguments || Array.isArray(entry) ? Array.from(entry) : entry
      }
    })
  )
}

export async function setTestGaCookies(page) {
  await page.evaluate(
    ({ ga4CookieName }) => {
      document.cookie = '_ga=GA1.1.111.222;path=/'
      document.cookie = `${ga4CookieName}=GS1.1.111;path=/`
    },
    { ga4CookieName: TEST_GA4_COOKIE_NAME }
  )
}

export async function getGaCookieNames(page) {
  const cookies = await page.context().cookies()

  return cookies
    .map((cookie) => cookie.name)
    .filter((name) => name === '_ga' || name.startsWith('_ga_'))
}

export async function dispatchPersistedPageshow(page) {
  await page.evaluate(() => {
    const event = new Event('pageshow')
    Object.defineProperty(event, 'persisted', { value: true })
    window.dispatchEvent(event)
  })
}

export function servicePath(baseURL, path) {
  return new URL(path.replace(/^\//, ''), baseURL).pathname
}

export async function readConsentPolicyFromPage(page) {
  const cookies = await page.context().cookies()
  const consent = cookies.find((cookie) => cookie.name === CONSENT_COOKIE_NAME)

  if (!consent) {
    return null
  }

  try {
    return JSON.parse(
      Buffer.from(decodeURIComponent(consent.value), 'base64').toString('utf8')
    )
  } catch {
    return null
  }
}

export function isCookieFormPost(request, analyticsValue) {
  if (request.method() !== 'POST') {
    return false
  }

  const pathname = new URL(request.url()).pathname

  if (!pathname.endsWith('/cookies')) {
    return false
  }

  const contentType = request.headers()['content-type'] ?? ''

  if (contentType.includes('application/json')) {
    return false
  }

  return (request.postData() ?? '').includes(`analytics=${analyticsValue}`)
}

export async function failJsonCookiePosts(page, { abort = false } = {}) {
  await page.route('**/cookies', async (route) => {
    const request = route.request()

    if (request.method() !== 'POST') {
      await route.continue()
      return
    }

    const contentType = request.headers()['content-type'] ?? ''

    if (contentType.includes('application/json')) {
      if (abort) {
        await route.abort('failed')
        return
      }

      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'failed' })
      })
      return
    }

    await route.continue()
  })
}
