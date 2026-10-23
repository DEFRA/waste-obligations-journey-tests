/**
 * The application clock for the scenario under test. A LOCAL time-shifted
 * stack runs the frontends on a shifted clock, so the journeys need it to know
 * which notes the apps should offer. Set JOURNEY_NOW to the same RFC 3339
 * timestamp the frontends were started with; unset, it is the real date.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {() => Date} [realNow]
 * @returns {Date}
 */
export function getJourneyNow(env = process.env, realNow = () => new Date()) {
  const raw = env.JOURNEY_NOW
  if (raw === undefined || raw === '') {
    return realNow()
  }

  const shifted = new Date(raw)
  if (Number.isNaN(shifted.getTime())) {
    throw new TypeError(
      `JOURNEY_NOW must be an RFC 3339 timestamp, got "${raw}"`
    )
  }

  return shifted
}

// Built once. Acceptance years are resolved for every note on a list.
const ukYearMonthFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: 'numeric'
})

// Mirrors the frontend's compliance year: Feb–Jan in Europe/London, so
// January belongs to the previous year. An omitted date is the scenario
// clock, so a time-shifted run does not fall back to the machine date.
export function getComplianceYear(date = getJourneyNow()) {
  const parts = ukYearMonthFormat.formatToParts(date)
  const year = Number(parts.find((part) => part.type === 'year').value)
  const month = Number(parts.find((part) => part.type === 'month').value)

  return month === 1 ? year - 1 : year
}

/**
 * Whether the waste-obligations API (which always runs on the real date) can
 * take a compliance declaration for the scenario's compliance year. It only
 * accepts the current compliance year, so a scenario that has moved into a
 * different year cannot submit one.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {() => Date} [realNow]
 * @returns {boolean}
 */
export function canSubmitDeclarations(
  env = process.env,
  realNow = () => new Date()
) {
  return (
    getComplianceYear(getJourneyNow(env, realNow)) ===
    getComplianceYear(realNow())
  )
}
