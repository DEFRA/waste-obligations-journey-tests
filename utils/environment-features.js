import { test } from '@playwright/test'
import { usesPackagingEntryPoint } from './journey-entry-point.js'

export const ANALYTICS_ACCEPT_BUTTON_NAME =
  /accept analytics cookies|derbyn cwcis dadansoddeg/i

export const PAGE_NOT_FOUND_HEADING =
  /page not found|heb ddod o hyd i['’]r dudalen/i

export const FEATURE_SHOW_PRNS = 'FEATURE_SHOW_PRNS'
export const FEATURE_CSOC_ENABLED = 'FEATURE_CSOC_ENABLED'
export const FEATURE_SHOW_MULTI_YEAR_OBLIGATIONS =
  'FEATURE_SHOW_MULTI_YEAR_OBLIGATIONS'
export const FEATURE_ANALYTICS = 'FEATURE_ANALYTICS'
export const FEATURE_SHOW_PRNS_ON_CDP = 'FEATURE_SHOW_PRNS_ON_CDP'

export function skipUnlessEnabled(enabled, reason) {
  test.skip(!enabled, reason)
}

export function readBooleanEnv(name, env = process.env) {
  const value = env[name]
  if (value === undefined || value === '') {
    return undefined
  }

  return /^(true|1|yes)$/i.test(String(value).trim())
}

export function isFeatureFlagEnabled(name, env = process.env) {
  return readBooleanEnv(name, env) === true
}

export function skipUnlessFeatureFlagEnabled(name) {
  if (readBooleanEnv(name) === false) {
    skipUnlessEnabled(false, `${name} is false for this environment`)
  }
}

export function resolvePrnsAvailability({ configured, pageShown }) {
  if (configured === false) {
    return {
      action: 'skip',
      reason: 'FEATURE_SHOW_PRNS is false for this environment'
    }
  }

  if (pageShown) {
    return { action: 'run' }
  }

  return {
    action: 'fail',
    reason: 'FEATURE_SHOW_PRNS is enabled but the PRNs page was not found'
  }
}

function applyPrnsAvailability({ configured, pageShown }) {
  const result = resolvePrnsAvailability({ configured, pageShown })
  if (result.action === 'fail') {
    throw new Error(result.reason)
  }

  if (result.action === 'skip') {
    skipUnlessEnabled(false, result.reason)
  }
}

export function skipUnlessPrnsConfigured() {
  skipUnlessFeatureFlagEnabled(FEATURE_SHOW_PRNS)
}

export function skipUnlessCsocEnabled() {
  skipUnlessFeatureFlagEnabled(FEATURE_CSOC_ENABLED)
}

export function skipUnlessAnalyticsEnabled() {
  skipUnlessFeatureFlagEnabled(FEATURE_ANALYTICS)
}

export function pageNotFoundHeading(page) {
  return page.getByRole('heading', { name: PAGE_NOT_FOUND_HEADING })
}

export async function skipUnlessPrnsSignInOffered(page) {
  const configured = readBooleanEnv(FEATURE_SHOW_PRNS)
  if (configured === false) {
    applyPrnsAvailability({ configured, pageShown: false })
    return
  }

  const notFound = pageNotFoundHeading(page)
  const email = page.getByLabel(/email/i)

  await email.or(notFound).waitFor({ state: 'visible', timeout: 15_000 })
  applyPrnsAvailability({
    configured,
    pageShown: !(await notFound.isVisible())
  })
}

export async function skipUnlessPrnsEnabled(prnsListPage) {
  const configured = readBooleanEnv(FEATURE_SHOW_PRNS)
  if (configured === false) {
    applyPrnsAvailability({ configured, pageShown: false })
    return
  }

  const notFound = pageNotFoundHeading(prnsListPage.page)

  await prnsListPage.heading
    .or(notFound)
    .waitFor({ state: 'visible', timeout: 15_000 })
  applyPrnsAvailability({
    configured,
    pageShown: !(await notFound.isVisible())
  })
}

export function usesMultiYearObligations() {
  return (
    usesPackagingEntryPoint() &&
    isFeatureFlagEnabled(FEATURE_SHOW_MULTI_YEAR_OBLIGATIONS)
  )
}

export function usesShowPrnsOnCdp() {
  return (
    usesPackagingEntryPoint() && isFeatureFlagEnabled(FEATURE_SHOW_PRNS_ON_CDP)
  )
}
