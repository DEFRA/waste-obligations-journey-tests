import { test } from '@playwright/test'
import { usesPackagingEntryPoint } from './journey-entry-point.js'

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

export async function skipUnlessPrnsEnabled(prnsListPage) {
  skipUnlessEnabled(
    await prnsListPage.isAvailable(),
    'PRNs are not enabled on this environment'
  )
}

export async function skipUnlessAnalyticsEnabled(page) {
  skipUnlessEnabled(
    await isLocatorVisible(
      page.getByRole('button', { name: 'Accept analytics cookies' })
    ),
    'Cookie banner is not shown; analytics is not configured on this environment'
  )
}
