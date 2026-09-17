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
