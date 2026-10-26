import { getProducerObligationsPath } from '../utils/journey-entry-point.js'
import { openAuthenticatedProducerPrnsList } from '../utils/prns-list-navigation.js'
import { defineMultipleSelectionJourneys } from '../utils/prns-multiple-selection-journey.js'

// The DP journeys use the project's default auth state.
defineMultipleSelectionJourneys({
  account: 'dp',
  label: 'Producer',
  tag: 'DP',
  openPrnsList: openAuthenticatedProducerPrnsList,
  obligationsPath: getProducerObligationsPath
})
