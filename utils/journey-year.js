const DEFAULT_JOURNEY_YEAR = 2026

/**
 * Obligation year the journeys exercise. Defaults to 2026; set JOURNEY_YEAR
 * (for example 2027) when running against a time-shifted LOCAL stack where
 * the 2026 lists are empty.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number}
 */
export function getJourneyYear(env = process.env) {
  const raw = env.JOURNEY_YEAR
  if (raw === undefined || raw === '') {
    return DEFAULT_JOURNEY_YEAR
  }

  const year = Number(raw)
  if (!Number.isInteger(year)) {
    throw new TypeError(`JOURNEY_YEAR must be a whole year, got "${raw}"`)
  }

  return year
}
