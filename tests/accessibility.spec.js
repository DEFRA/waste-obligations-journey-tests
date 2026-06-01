import { test } from '../fixtures/pages.fixture.js'
import { TEST_USER_NAME } from '../data/csoc.data.js'
import {
  initialiseAccessibilityChecking,
  analyseAccessibility,
  generateAccessibilityReports,
  generateAccessibilityReportIndex
} from './accessibility-checking.js'

test.describe('Accessibility testing — CSOC journey', () => {
  test.beforeAll(async () => {
    await initialiseAccessibilityChecking()
  })

  test.afterAll(async () => {
    generateAccessibilityReports('csoc-journey')
    generateAccessibilityReportIndex()
  })

  test('scan each page from obligations through confirmation', async ({
    page,
    landingPage,
    obligationsPage,
    csocAboutPage,
    csocSubmissionPage,
    csocConfirmationPage
  }) => {
    test.setTimeout(300_000)

    await test.step('Obligations page', async () => {
      await landingPage.goto()
      await landingPage.goToObligations()
      await obligationsPage.expectLoaded()
      await analyseAccessibility(page, 'obligations')
    })

    await test.step('CSOC About page', async () => {
      await obligationsPage.startCsocSubmission()
      await csocAboutPage.expectLoaded()
      await analyseAccessibility(page, 'csoc-about')
    })

    await test.step('CSOC Check-and-submit page', async () => {
      await csocAboutPage.clickContinue()
      await csocSubmissionPage.expectLoaded()
      await analyseAccessibility(page, 'csoc-check-and-submit')
    })

    await test.step('CSOC Confirmation page', async () => {
      await csocSubmissionPage.submit(TEST_USER_NAME)
      await csocConfirmationPage.expectSubmitted()
      await analyseAccessibility(page, 'csoc-confirmation')
    })
  })
})
