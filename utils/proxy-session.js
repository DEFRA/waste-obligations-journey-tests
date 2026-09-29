import { requireEnv } from './env.js'
import {
  getPublicFrontendUrl,
  getWasteObligationsFrontendBaseUrl,
  usesPackagingEntryPoint
} from './journey-entry-point.js'

// The proxy's base path is a 404 that never challenges for sign-in, so warm
// the session on the account's own certificate/statement page: the same URL
// the handoff opens.
function signInUrl(account) {
  const year = new Date().getFullYear()
  if (account === 'cso') {
    const schemeId = requireEnv('WASTE_OBLIGATION_CSO_ORG_ID')
    return getPublicFrontendUrl(
      `/cso/${schemeId}/compliance/statement`,
      `year=${year}`
    )
  }
  const organisationId = requireEnv('WASTE_OBLIGATION_ORG_ID')
  return getPublicFrontendUrl(
    `/producer/${organisationId}/compliance/certificate`,
    `year=${year}`
  )
}

// The CSoC handoff leaves the Azure frontend for the public CDP proxy, which
// keeps its own session. Without a proxy session cookie the handoff bounces
// proxy -> signin-oidc -> b2clogin -> proxy, and that chain of cross-site
// process swaps trips an internal assertion in Playwright's WebKit backend
// ("Error: Assertion error"), killing Safari runs. Establishing the proxy
// session during setup (which runs in Chromium) puts its cookie in the saved
// storageState, so the handoff in the browser projects is a single hop.
export async function establishProxySession(page, account) {
  if (!usesPackagingEntryPoint()) {
    return
  }

  const frontendUrl = getWasteObligationsFrontendBaseUrl()
  const { origin } = new URL(frontendUrl)
  const context = page.context()
  const cookieNames = async () =>
    new Set((await context.cookies(frontendUrl)).map((cookie) => cookie.name))
  const cookiesBefore = await cookieNames()

  await page.goto(signInUrl(account), { timeout: 60_000 })
  // B2C already holds a session from the Azure sign-in, so the OIDC round
  // trip is silent; wait until it lands back on the proxy with its cookie set.
  await page.waitForURL(
    (url) => url.origin === origin && !url.pathname.endsWith('/signin-oidc'),
    { timeout: 60_000 }
  )
  await page.waitForLoadState('networkidle')

  // Landing on the proxy origin alone proves nothing: a public or error page
  // there would pass the URL check. Without a new proxy cookie the saved
  // storageState would silently reintroduce the WebKit redirect chain.
  const newCookies = [...(await cookieNames())].filter(
    (name) => !cookiesBefore.has(name)
  )
  if (newCookies.length === 0) {
    throw new Error(
      `No session cookie was set for ${frontendUrl} (ended on ${page.url()}). ` +
        'The CSoC handoff would still go through the B2C redirect chain.'
    )
  }
}
