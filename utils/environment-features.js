import { expect, test } from '@playwright/test'
import { usesPackagingEntryPoint } from './journey-entry-point.js'
import { canSubmitDeclarations } from './journey-clock.js'

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
export const FEATURE_MANAGE_OBLIGATIONS = 'FEATURE_MANAGE_OBLIGATIONS'

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

// Local and the shared Docker action seed the notes a journey needs, so a
// missing one fails there. Deployed targets are not guaranteed to have one,
// so the caller skips. Kept out of the test body for
// playwright/no-conditional-in-test.
export function expectSeededOnLocal(value, description, env = process.env) {
  if (env.ENVIRONMENT === 'local') {
    expect(
      value,
      `The local journey fixture must contain ${description}.`
    ).toBeDefined()
  }
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

export const PRNS_LIST_HEADING = /accept or reject prns and perns/i

// The CDP hop from Packaging can arrive already signed in (the session carries across), so the PRNs list
// heading counts as a valid landing state alongside the sign-in form and the sign-in link.
export async function skipUnlessPrnsSignInOffered(page) {
  const configured = readBooleanEnv(FEATURE_SHOW_PRNS)
  if (configured === false) {
    applyPrnsAvailability({ configured, pageShown: false })
    return
  }

  const notFound = pageNotFoundHeading(page)
  const email = page.getByLabel(/email/i)
  const signIn = page.getByRole('link', { name: /^sign in$/i })
  const alreadySignedIn = page.getByRole('heading', { name: PRNS_LIST_HEADING })

  await email
    .or(notFound)
    .or(signIn)
    .or(alreadySignedIn)
    .waitFor({ state: 'visible', timeout: 15_000 })

  if ((await signIn.isVisible()) && !(await email.isVisible())) {
    await signIn.click()
    await email.or(notFound).waitFor({ state: 'visible', timeout: 15_000 })
  }

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

// The waste-obligations entry point can reach the PRNs list through the CDP
// obligations page, which the frontend serves only with FEATURE_MANAGE_OBLIGATIONS.
export function usesCdpObligations() {
  return (
    !usesPackagingEntryPoint() &&
    isFeatureFlagEnabled(FEATURE_MANAGE_OBLIGATIONS)
  )
}

// The waste-obligations API runs on the real date and only takes a declaration
// for the current compliance year, so a time-shifted scenario in a later
// compliance year cannot submit one.
export function skipUnlessDeclarationsSubmittable() {
  skipUnlessEnabled(
    canSubmitDeclarations(),
    'JOURNEY_NOW is in a later compliance year than the waste-obligations API, which runs on the real date and rejects declarations for it'
  )
}
