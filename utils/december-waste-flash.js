import { getComplianceYear } from './prn-selection.js'

// Mirrors the frontend's December waste flash rules (MO-479) so a journey can
// work out, from today's date, which awaiting PRNs should show the blue
// "Can be accepted towards {yearOne} or {yearTwo}" flash. The flash is
// rendered server-side from the frontend's own clock, so journeys can't move
// the date: they assert whatever today's date implies.
//
// A PRN flashes when it is December waste, awaiting acceptance, issued in the
// current UK December/January window, and can be accepted into two years.

// 2025 December waste is a one-off: it never offers a choice of year.
const DECEMBER_WASTE_NO_CHOICE_YEAR = 2025
const DECEMBER_WASTE_NO_CHOICE_UNTIL_YEAR = 2026

function ukYearMonth(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: 'numeric'
  }).formatToParts(date)
  return {
    year: Number(parts.find((part) => part.type === 'year').value),
    month: Number(parts.find((part) => part.type === 'month').value)
  }
}

export function isInDecemberJanuaryFlashWindow(now = new Date()) {
  const { month } = ukYearMonth(now)
  return month === 12 || month === 1
}

function isIssuedInCurrentWindow(issuedAt, now) {
  const issued = new Date(issuedAt)
  if (!issuedAt || Number.isNaN(issued.getTime())) {
    return false
  }
  const today = ukYearMonth(now)
  const windowStartYear = today.month === 12 ? today.year : today.year - 1
  const issue = ukYearMonth(issued)
  return (
    (issue.year === windowStartYear && issue.month === 12) ||
    (issue.year === windowStartYear + 1 && issue.month === 1)
  )
}

function availableAcceptanceYears(prn, now) {
  const prnYear = prn.obligationYear
  if (!Number.isInteger(prnYear)) {
    return []
  }
  const complianceYear = getComplianceYear(now)
  if (prnYear > complianceYear) {
    return []
  }
  if (
    prnYear === DECEMBER_WASTE_NO_CHOICE_YEAR &&
    (complianceYear === DECEMBER_WASTE_NO_CHOICE_YEAR ||
      complianceYear === DECEMBER_WASTE_NO_CHOICE_UNTIL_YEAR)
  ) {
    return [complianceYear]
  }
  if (now.getTime() < Date.UTC(prnYear + 1, 1, 1)) {
    return [prnYear, prnYear + 1]
  }
  return prnYear + 1 === complianceYear ? [complianceYear] : []
}

// The flash text the frontend should show for `prn` at `now`, or null when no
// flash is expected.
export function expectedDecemberWasteFlashText(prn, now = new Date()) {
  if (
    prn?.decemberWaste !== true ||
    prn?.status !== 'AwaitingAcceptance' ||
    !isInDecemberJanuaryFlashWindow(now) ||
    !isIssuedInCurrentWindow(prn.issuedAt, now)
  ) {
    return null
  }
  const years = availableAcceptanceYears(prn, now)
  return years.length === 2
    ? `Can be accepted towards ${years[0]} or ${years[1]}`
    : null
}
