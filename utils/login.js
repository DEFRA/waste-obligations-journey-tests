// Shared B2C credential-submission logic, extracted from auth.setup.js /
// cso-auth.setup.js so a spec can perform its own explicit in-test login
// (e.g. to exercise a different persona than the shared storageState
// fixtures) without duplicating the redirect-branching logic.
export async function submitB2CCredentials(page, email, password) {
  // The B2C flow can resolve in two ways:
  //   - straight to the login form on b2clogin.com
  //   - back to /report-data/error (e.g. UX004) requiring a "Sign in" click
  // Wait for the redirect chain to settle, then branch on URL.
  await page.waitForLoadState('networkidle')

  if (page.url().includes('error')) {
    await page.getByRole('link', { name: /sign in/i }).click()
  }

  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in|continue|next/i }).click()
}

export async function submitB2CCredentialsIfNeeded(page, email, password) {
  const emailField = page.getByLabel(/email/i)

  if (page.url().includes('b2clogin') || (await emailField.isVisible())) {
    await submitB2CCredentials(page, email, password)
  }
}

// Sign in from the start page the entry point redirects to. The real B2C shows
// an email and password form (or the app's error page with a "Sign in" link);
// the LOCAL stack's mock B2C lists the seeded users instead, one "Sign in"
// button each, in a cell with the user's email.
export async function signInThroughB2C(page, email, password) {
  const mockUser = page
    .getByRole('cell')
    .filter({ hasText: email })
    .getByRole('button', { name: /^sign in$/i })

  await page
    .getByLabel(/email/i)
    .or(page.getByRole('link', { name: /sign in/i }))
    .or(mockUser)
    .first()
    .waitFor({ timeout: 60_000 })

  if (await mockUser.isVisible()) {
    await mockUser.click()
    return
  }

  await submitB2CCredentials(page, email, password)
}
