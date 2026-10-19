// Mirrors the frontend's compliance year: Feb–Jan in Europe/London, so
// January belongs to the previous year.
export function getComplianceYear(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: 'numeric'
  }).formatToParts(date)
  const year = Number(parts.find((part) => part.type === 'year').value)
  const month = Number(parts.find((part) => part.type === 'month').value)
  return month === 1 ? year - 1 : year
}

// A standard PRN in the current compliance year is always offered for
// multi-select. December waste depends on the Dec–Jan window, so it is never
// chosen here; the frontend unit tests own that rule.
export function findStandardSelectablePrn(prns, date = new Date()) {
  const complianceYear = getComplianceYear(date)
  return prns.find(
    (prn) =>
      prn.decemberWaste === false && prn.obligationYear === complianceYear
  )
}

// December waste's choice window: from 1 December of its year to 1 February
// the year after, in UTC (UK is GMT in both months).
const DECEMBER = 12
const NO_CHOICE_YEAR = 2025
const NO_CHOICE_UNTIL_YEAR = 2026

/**
 * Mirrors the frontends: the years a note can be accepted into at `now`.
 * Standard notes: their own year while it is the current compliance year.
 * December waste: its own year before the window, both years inside it, then
 * the next year while that is current. 2025 December waste never has a choice.
 *
 * @param {{ obligationYear?: number, decemberWaste?: boolean }} prn
 * @param {Date} [now]
 * @returns {number[]}
 */
export function resolveAcceptanceYears(prn, now = new Date()) {
  const prnYear = prn?.obligationYear
  const thisYear = getComplianceYear(now)

  if (!Number.isInteger(prnYear) || prnYear > thisYear) {
    return []
  }

  if (!prn.decemberWaste) {
    return prnYear === thisYear ? [prnYear] : []
  }

  if (prnYear === NO_CHOICE_YEAR && thisYear <= NO_CHOICE_UNTIL_YEAR) {
    return [thisYear]
  }

  const ms = now.getTime()
  const windowStart = Date.UTC(prnYear, DECEMBER - 1, 1)
  const windowEnd = Date.UTC(prnYear + 1, 1, 1)

  if (ms >= windowStart && ms < windowEnd) {
    return [prnYear, prnYear + 1]
  }

  if (prnYear === thisYear) {
    return [prnYear]
  }

  return prnYear + 1 === thisYear ? [thisYear] : []
}

// The first awaiting note the list for `year` should offer at `now`.
export function findPrnAcceptableInto(prns, year, now = new Date()) {
  return prns.find((prn) => resolveAcceptanceYears(prn, now).includes(year))
}
