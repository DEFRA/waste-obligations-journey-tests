import { getComplianceYear, getJourneyNow } from './journey-clock.js'

// Each login opens one note type, so a run covers both the PRN and PERN wording.
export const PRN_ACCOUNTS = [
  {
    account: 'dp',
    label: 'DP',
    storageState: 'playwright/.auth/dp.json',
    prnType: 'PRN'
  },
  {
    account: 'cso',
    label: 'CSO',
    storageState: 'playwright/.auth/cso.json',
    prnType: 'PERN'
  }
]

// The backend marks PERNs with type 'PERN'; everything else is a PRN.
export function noteType(prn) {
  return prn.type === 'PERN' ? 'PERN' : 'PRN'
}

// A standard PRN in the current compliance year is always offered for
// multi-select. December waste depends on the Dec–Jan window, so it is never
// chosen here; the frontend unit tests own that rule.
export function findStandardSelectablePrn(prns, date = getJourneyNow()) {
  const complianceYear = getComplianceYear(date)
  return prns.find(
    (prn) =>
      prn.decemberWaste === false && prn.obligationYear === complianceYear
  )
}
