import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DOWNLOAD_PDF_BUTTON_NAME,
  REJECTED_STATUS_LABEL,
  rejectedConfirmationHeading,
  rejectedStatusMeaning
} from '../utils/prn-confirmation.js'

test('rejected confirmation names the note type', () => {
  assert.equal(
    rejectedConfirmationHeading('PRN'),
    'You have rejected this PRN.'
  )
  assert.equal(
    rejectedConfirmationHeading('PERN'),
    'You have rejected this PERN.'
  )
  assert.equal(
    rejectedStatusMeaning('PRN'),
    'The producer or compliance scheme rejected the PRN.'
  )
  assert.equal(
    rejectedStatusMeaning('PERN'),
    'The producer or compliance scheme rejected the PERN.'
  )
  assert.equal(REJECTED_STATUS_LABEL, 'Rejected')
})

test('the download control matches awaiting, accepted and rejection labels', () => {
  assert.match('Download this PRN as a PDF', DOWNLOAD_PDF_BUTTON_NAME)
  assert.match(
    'Download this awaiting acceptance PERN as a PDF',
    DOWNLOAD_PDF_BUTTON_NAME
  )
  assert.doesNotMatch(
    'Download this PRN as a PDF or HTML',
    DOWNLOAD_PDF_BUTTON_NAME
  )
  assert.doesNotMatch('Download this PRN', DOWNLOAD_PDF_BUTTON_NAME)
})
