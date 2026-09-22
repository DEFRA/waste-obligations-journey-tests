import { test } from '@playwright/test'
import { usesPackagingEntryPoint } from './journey-entry-point.js'

export const ANALYTICS_ACCEPT_BUTTON_NAME =
  /accept analytics cookies|derbyn cwcis dadansoddeg/i

export const PAGE_NOT_FOUND_HEADING =
  /page not found|heb ddod o hyd i['’]r dudalen/i

export async function isLocatorVisible(locator, timeout = 10_000) {
  try {
    await locator.waitFor({ state: 'visible', timeout })
    return true
  } catch {
    return false
  }
}

export function skipUnlessEnabled(enabled, reason) {
  test.skip(!enabled, reason)
}

export async function skipUnlessPackagingObligationsShown(landingPage) {
  if (!usesPackagingEntryPoint()) {
    return
  }

  skipUnlessEnabled(
    await landingPage.hasObligationsEntry(),
    'Manage recycling obligations is not shown on this environment'
  )
}

export async function skipUnlessPackagingCsocEnabled(obligationsPage) {
  if (!usesPackagingEntryPoint()) {
    return
  }

  skipUnlessEnabled(
    await obligationsPage.hasCsocAction(),
    'CSOC is not enabled on this environment'
  )
}

export function pageNotFoundHeading(page) {
  return page.getByRole('heading', { name: PAGE_NOT_FOUND_HEADING })
}

export async function skipUnlessPrnsSignInOffered(page) {
  const notFound = pageNotFoundHeading(page)
  const email = page.getByLabel(/email/i)

  await email.or(notFound).waitFor({ state: 'visible', timeout: 15_000 })
  skipUnlessEnabled(
    !(await notFound.isVisible()),
    'PRNs are not enabled on this environment'
  )
}

export async function skipUnlessPrnsEnabled(prnsListPage) {
  const notFound = pageNotFoundHeading(prnsListPage.page)

  await prnsListPage.heading
    .or(notFound)
    .waitFor({ state: 'visible', timeout: 15_000 })
  skipUnlessEnabled(
    !(await notFound.isVisible()),
    'PRNs are not enabled on this environment'
  )
}

export async function skipUnlessAnalyticsEnabled(page) {
  skipUnlessEnabled(
    await isLocatorVisible(
      page.getByRole('button', { name: ANALYTICS_ACCEPT_BUTTON_NAME })
    ),
    'Cookie banner is not shown; analytics is not configured on this environment'
  )
}
