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
