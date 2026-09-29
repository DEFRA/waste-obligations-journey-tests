// The CSoC handoff leaves the Azure frontend for packaging-waste-proxy, which
// keeps its own session. Without a proxy session cookie the handoff bounces
// proxy -> signin-oidc -> b2clogin -> proxy, and that chain of cross-site
// process swaps trips an internal assertion in Playwright's WebKit backend
// ("Error: Assertion error"), killing Safari runs. Establishing the proxy
// session here (setup runs in Chromium) puts its cookie in the saved
// storageState, so the handoff in the browser projects is a single hop.

// EPR_PROXY_URL wins; otherwise take the origin of the certificate template.
// Unset for local runs, where the frontend is not behind the proxy.
export function getProxyOrigin() {
  const url =
    process.env.EPR_PROXY_URL ?? process.env.EPR_CERTIFICATE_URL_TEMPLATE
  return url ? new URL(url).origin : null
}

export async function establishProxySession(page) {
  const origin = getProxyOrigin()
  if (!origin) {
    return
  }

  await page.goto(`${origin}/manage-recycling-obligations`, {
    timeout: 60_000
  })
  // B2C already holds a session from the frontend sign-in, so the OIDC round
  // trip is silent; wait until it lands back on the proxy with its cookie set.
  await page.waitForURL((url) => url.origin === origin, { timeout: 60_000 })
  await page.waitForLoadState('networkidle')
}
