import { getCsoObligationsPath } from '../utils/journey-entry-point.js'
import { openAuthenticatedCsoPrnsList } from '../utils/prns-list-navigation.js'
import { defineMultipleSelectionJourneys } from '../utils/prns-multiple-selection-journey.js'

// storageState comes from cso-auth.setup.js (playwright/.auth/cso.json).
defineMultipleSelectionJourneys({
  account: 'cso',
  label: 'Compliance scheme',
  tag: 'CSO',
  storageState: 'playwright/.auth/cso.json',
  openPrnsList: openAuthenticatedCsoPrnsList,
  obligationsPath: getCsoObligationsPath
})
