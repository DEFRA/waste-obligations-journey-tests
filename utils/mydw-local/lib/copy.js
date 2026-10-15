'use strict'

// Expected on-screen copy for the MY&DW pages, with ShowMultiYearObligations on (multi-year) and off (legacy).
// Single source for the manual journeys (steps/*.js) and the automated spec (tests/mydw-e2e.spec.js).
// Source: epr-packaging-frontend main resx (en). Update here when the content changes.

const submissionName = (orgType) =>
  orgType === 'CS' ? 'statement of compliance' : 'certificate of compliance'

function tile({ flagOn, orgType, year }) {
  if (flagOn) {
    return {
      link: /^manage recycling obligations$/i,
      lines: [
        'View or manage your recycling obligations by year (includes PRNs and PERNs).',
        `An approved or delegated person must submit your ${year} ${submissionName(orgType)} on or before 31 January ${year + 1}.`
      ],
      searchLink: /^search all prns and perns$/i
    }
  }
  // Legacy tile: the deadline line shows until the certificate/statement is submitted, then "view your …".
  return {
    link: new RegExp(`^manage your ${year} recycling obligations$`, 'i'),
    lines: [
      'Review your recycling obligations and accept PRNs or PERNs to meet them. You can also:'
    ],
    anyOf: [
      `An approved or delegated person must submit your ${submissionName(orgType)} before or on 31 January ${year + 1}.`,
      `view your ${submissionName(orgType)}`
    ],
    searchLink: null
  }
}

function deadline(year) {
  return `You have until 31 January ${year + 1} to meet your recycling obligations for ${year}.`
}

// "How to meet your recycling obligations" section (MO-394 / MO-449).
function howToMeet({ flagOn, calculated, year }) {
  if (flagOn && !calculated) {
    return [
      `Your ${year} recycling obligations have not been calculated yet. They will be calculated after:`,
      `you submit your packaging data for ${year - 1}`,
      'your environmental regulator accepts your H1 and H2 packaging data submissions',
      'Until then, you can:',
      'acquire packaging waste recycling notes (PRNs) and packaging waste export recycling notes (PERNs)',
      'accept your PRNs and PERNs towards your recycling obligations',
      'You will see data for PRNs and PERNs you have acquired in the table below. But you will only see progress against your actual recycling obligations once they have been calculated.'
    ]
  }
  if (flagOn) {
    return [
      `Acquire and accept packaging waste recycling notes (PRNs) and packaging waste export recycling notes (PERNs) until your recycling obligations are fully met. Select a material for information on how the data was calculated and view your progress towards meeting your ${year} recycling obligations.`
    ]
  }
  if (!calculated) {
    return [
      'Your recycling obligations will be calculated after:',
      `you submit your packaging data for ${year - 1}`,
      'the regulator accepts your data submissions',
      'You can start acquiring and accepting PRNs and PERNs to meet your recycling obligations.'
    ]
  }
  return [
    `Acquire and accept PRNs and PERNs until your recycling obligations are fully met. Select a material for information on how the data was calculated and view your progress towards meeting your ${year} recycling obligations.`
  ]
}

const DETAILS_HEADING =
  'Why does the recycling obligations table already have tonnage awaiting acceptance?'

function detailsLines(year) {
  return [
    'Tonnage awaiting acceptance is for PRNs or PERNs that have been issued to you but have not yet been accepted.',
    'You have been issued at least one December waste PRN or PERN.',
    'These:',
    'are for packaging waste received for recycling at UK or overseas reprocessing sites in December',
    `can be accepted towards either your ${year - 1} or ${year} recycling obligations`,
    'have a blue tag to show which years you can accept them towards',
    `A December waste PRN or PERN will appear under ‘Tonnage awaiting acceptance’ for both ${year - 1} and ${year} until you accept it towards a specific year’s recycling obligations.`,
    'Once you accept the PRN or PERN towards a specific year, it is assigned to that year only and the blue tag is removed.'
  ]
}

function noteHeading(note) {
  return note === 'PERN'
    ? 'Packaging Waste Export Recycling Note'
    : 'Packaging Waste Recycling Note'
}

function decemberWarning(note, year) {
  return note === 'PERN'
    ? `This PERN relates to waste exported for reprocessing in December ${year}.`
    : `This PRN relates to waste received for reprocessing in December ${year}.`
}

function yearQuestion(note) {
  return `Which year’s recycling obligations do you want to accept this ${note} towards?`
}

// Accept confirmation (MO-331). PERN has no multi-year key and falls back to the legacy heading (K12).
function confirm({ flagOn, note, year, tonnes, material }) {
  if (flagOn) {
    return {
      heading: `Are you sure you want to accept this ${note} towards your ${year} recycling obligations?`,
      body: `This will contribute ${tonnes} tonnes towards your recycling obligation for ${material.toLowerCase()}.`,
      title: `Accept this ${note}`
    }
  }
  return {
    heading: `Accept this ${note} towards your ${year} recycling obligations?`,
    body: `This will credit ${tonnes} tonnes towards your ${material.toLowerCase()} recycling obligation.`,
    title: `Accept this ${note}`
  }
}

// Single accept success (MO-332, MO-309).
function accepted({ flagOn, note, year, tonnes, material }) {
  if (flagOn) {
    return {
      banner: `You accepted this ${note} towards your ${year} recycling obligations`,
      body: `You have contributed ${tonnes} tonnes towards your recycling obligation for ${material.toLowerCase()}.`,
      acceptedTowards: `Accepted towards ${year} recycling obligations`
    }
  }
  return {
    banner: `${note} accepted towards your ${year} recycling obligation.`,
    body: `${tonnes} tonnes credited towards your ${material.toLowerCase()} recycling obligation.`,
    acceptedTowards: null
  }
}

// Bulk accept panel (MO-335): count/type wording varies, so this is a pattern.
function acceptedMany({ flagOn, year }) {
  return flagOn
    ? new RegExp(
        `You[’']ve accepted .+ towards your ${year} recycling obligations`
      )
    : /You[’']ve accepted (one|\d+) \S+/
}

function flashText(years, { list }) {
  return `Can be accepted towards ${years.join(' or ')}${list ? ' recycling obligations' : ''}`
}

const REGULATOR_MAILBOX = {
  EA: 'packagingproducers@environment-agency.gov.uk',
  NRW: 'packaging@naturalresourceswales.gov.uk',
  SEPA: 'producer.responsibility@sepa.org.uk',
  NIEA: 'packaging@daera-ni.gov.uk'
}

function record2025({ orgType }) {
  return {
    heading: `Your ${submissionName(orgType)} record for 2025`,
    links: [
      /^search prns and perns$/i,
      /^download a list of your prns and perns for 2025 \(csv\)$/i
    ]
  }
}

module.exports = {
  submissionName,
  tile,
  deadline,
  howToMeet,
  DETAILS_HEADING,
  detailsLines,
  noteHeading,
  decemberWarning,
  yearQuestion,
  confirm,
  accepted,
  acceptedMany,
  flashText,
  REGULATOR_MAILBOX,
  record2025
}
