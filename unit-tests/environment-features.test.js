import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ANALYTICS_ACCEPT_BUTTON_NAME,
  PAGE_NOT_FOUND_HEADING
} from '../utils/environment-features.js'

test('analytics accept button name matches English and Welsh banner copy', () => {
  assert.match('Accept analytics cookies', ANALYTICS_ACCEPT_BUTTON_NAME)
  assert.match('Derbyn cwcis dadansoddeg', ANALYTICS_ACCEPT_BUTTON_NAME)
  assert.doesNotMatch('Reject analytics cookies', ANALYTICS_ACCEPT_BUTTON_NAME)
  assert.doesNotMatch('Gwrthod cwcis dadansoddeg', ANALYTICS_ACCEPT_BUTTON_NAME)
})

test('page not found heading matches English and Welsh 404 copy', () => {
  assert.match('Page not found', PAGE_NOT_FOUND_HEADING)
  assert.match('Heb ddod o hyd i’r dudalen', PAGE_NOT_FOUND_HEADING)
  assert.match("Heb ddod o hyd i'r dudalen", PAGE_NOT_FOUND_HEADING)
  assert.doesNotMatch('Accept or reject PRNs and PERNs', PAGE_NOT_FOUND_HEADING)
})
