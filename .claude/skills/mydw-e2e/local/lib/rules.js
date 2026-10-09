'use strict'

// Port of the epr-packaging-frontend rules, used to compute the EXPECTED behaviour per PRN for a given clock:
//   Mappers/PrnAvailableAcceptanceYearsResolver.cs, Mappers/PrnDecemberWasteFlashWindowResolver.cs,
//   Application/Extensions/DateTimeExtensions.cs, Application/Extensions/ObligationYearOptions.cs
// If the frontend rules change, update this file — the MYDW-08 journey compares the UI against it.

const AWAITING = 4

function ukParts(date) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  })
  const p = Object.fromEntries(
    f.formatToParts(date).map((x) => [x.type, Number(x.value)])
  )
  return { year: p.year, month: p.month, day: p.day }
}

// Compliance year runs Feb..Jan, so January belongs to the previous year.
function complianceYear(now) {
  const { year, month } = ukParts(now)
  return month === 1 ? year - 1 : year
}

// "Choose a year" options: C+1, C, C-1 ... down to 2025, newest first.
function yearOptions(now) {
  const c = complianceYear(now)
  const out = []
  for (let y = c + 1; y >= 2025; y--) out.push(y)
  return out
}

function availableYears(prn, now) {
  if (Number(prn.PrnStatusId) !== AWAITING) return []
  const p = parseInt(prn.ObligationYear, 10)
  const c = complianceYear(now)
  if (Number.isNaN(p) || p > c) return []
  if (prn.DecemberWaste === true || prn.DecemberWaste === 1) {
    if (p === 2025 && (c === 2025 || c === 2026)) return [c]
    if (now.getTime() < Date.UTC(p + 1, 1, 1)) return [p, p + 1]
    if (p + 1 === c) return [c]
    return []
  }
  return p === c ? [p] : []
}

function inFlashWindow(prn, now) {
  const isDw = prn.DecemberWaste === true || prn.DecemberWaste === 1
  if (!isDw || availableYears(prn, now).length === 0) return false
  const { year, month } = ukParts(now)
  if (month !== 12 && month !== 1) return false
  const startYear = month === 12 ? year : year - 1
  const issued = new Date(
    prn.IssueDate.endsWith('Z') ? prn.IssueDate : `${prn.IssueDate}Z`
  )
  return (
    issued >= new Date(Date.UTC(startYear, 11, 1)) &&
    issued < new Date(Date.UTC(startYear + 1, 1, 1))
  )
}

// Expected UI for one PRN. Bulk checkbox: the running main-latest image only offers it when exactly one year is
// available (two-year December Waste PRNs must go through the single flow to pick a year).
function expectedFor(prn, now) {
  const years = availableYears(prn, now)
  const flash = inFlashWindow(prn, now)
  return {
    actionable: years.length > 0,
    years,
    choiceOfYear: years.length === 2,
    bulkCheckbox: years.length === 1,
    flash,
    flashText: flash
      ? `Can be accepted towards ${years.join(' or ')} recycling obligations`
      : null
  }
}

function describe(prn, now) {
  const e = expectedFor(prn, now)
  const note = prn.IsExport === true || prn.IsExport === 1 ? 'PERN' : 'PRN'
  const kind = `${note}, ${prn.DecemberWaste === true || prn.DecemberWaste === 1 ? 'DW' : 'std'} ${prn.ObligationYear}, issued ${String(prn.IssueDate).slice(0, 10)}`
  if (!e.actionable)
    return `${prn.PrnNumber} (${kind}): no Accept/Reject, no checkbox`
  return (
    `${prn.PrnNumber} (${kind}): Accept/Reject shown; years ${e.years.join('/')}` +
    `${e.choiceOfYear ? ' → year-choice page' : ' → straight to confirm'}; checkbox ${e.bulkCheckbox ? 'yes' : 'no'}` +
    `; flash ${e.flash ? `"${e.flashText}"` : 'no'}`
  )
}

module.exports = {
  complianceYear,
  yearOptions,
  availableYears,
  inFlashWindow,
  expectedFor,
  describe,
  AWAITING
}
