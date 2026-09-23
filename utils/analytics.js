export const TEST_GTM_KEY = 'GTM-TEST0001'
export const TEST_MEASUREMENT_ID = 'G-TEST000001'
export const TEST_GA4_COOKIE_NAME = `_ga_${TEST_MEASUREMENT_ID.slice(2)}`
export const CONSENT_COOKIE_NAME = 'waste-obligations-cookie-policy'

export function ga4CookieNameFromMeasurementId(measurementId) {
  const value = String(measurementId ?? '').trim()
  if (!value) {
    return ''
  }

  const tagId = /^G-/i.test(value) ? value.slice(2) : value

  return `_ga_${tagId}`
}

export async function readAnalyticsIds(page) {
  const banner = page.locator('.js-cookies-banner')
  const gtmKey = ((await banner.getAttribute('data-gtm-key')) ?? '').trim()
  const measurementId = (
    (await banner.getAttribute('data-measurement-id')) ?? ''
  ).trim()

  return {
    gtmKey,
    measurementId,
    ga4CookieName: ga4CookieNameFromMeasurementId(measurementId)
  }
}

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
  const cookieConfig = await page.evaluate(() => {
    const consent = document.querySelector('.js-cookie-consent-config')?.dataset
    const banner = document.querySelector('.js-cookies-banner')?.dataset

    return {
      cookiePath: consent?.analyticsCookiePath || '/',
      measurementId: banner?.measurementId || ''
    }
  })
  const ga4CookieName =
    ga4CookieNameFromMeasurementId(cookieConfig.measurementId) ||
    TEST_GA4_COOKIE_NAME
  const { hostname, protocol } = new URL(page.url())

  await page.context().addCookies([
    {
      name: '_ga',
      value: 'GA1.1.111.222',
      domain: hostname,
      path: cookieConfig.cookiePath,
      secure: protocol === 'https:'
    },
    {
      name: ga4CookieName,
      value: 'GS1.1.111',
      domain: hostname,
      path: cookieConfig.cookiePath,
      secure: protocol === 'https:'
    }
  ])
}

export function expectedAnalyticsCookiePath(baseURL) {
  const pathname = new URL(baseURL).pathname.replace(/\/+$/, '')

  return pathname || '/'
}

export async function getGaCookies(page) {
  const cookies = await page.context().cookies()

  return cookies.filter(
    (cookie) => cookie.name === '_ga' || cookie.name.startsWith('_ga_')
  )
}

export async function getGaCookieNames(page) {
  return (await getGaCookies(page)).map((cookie) => cookie.name)
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
