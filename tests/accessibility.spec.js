import { test, expect } from '../fixtures/pages.fixture.js'
import { TEST_USER_NAME } from '../data/csoc.data.js'
import { getOrgId, listAcceptedPrns } from '../utils/waste-obligations-api.js'
import {
  findOnlySubmittedDeclaration,
  resetOrgDeclarations
} from '../utils/test-setup.js'
import {
  getPrnUrl,
  usesPackagingEntryPoint
} from '../utils/journey-entry-point.js'
import { ensureProxySessionForWebKit } from '../utils/proxy-session.js'
import {
  skipUnlessCsocEnabled,
  skipUnlessPrnsConfigured
} from '../utils/environment-features.js'
import {
  initialiseAccessibilityChecking,
  analyseAccessibility,
  generateAccessibilityReports,
  generateAccessibilityReportIndex,
  assertNoAccessibilityIssues
} from './accessibility-checking.js'

// Shared backend org: keep serial so a single worker owns the lifecycle state
// across the submit → view scans.
test.describe.configure({ mode: 'serial' })

async function startCsocJourney({
  account,
  year,
  landingPage,
  chooseYearPage,
  obligationsPage,
  csocAboutPage
}) {
  skipUnlessCsocEnabled()
  await landingPage.goto(account)
  if (usesPackagingEntryPoint()) {
    await landingPage.expectLoaded()
    await landingPage.openObligations(chooseYearPage, obligationsPage, year)
    await obligationsPage.startCsocSubmission()
  }
  await csocAboutPage.expectLoaded()
}

async function openCsocView({
  account,
  request,
  year,
  obligationsPage,
  csocViewPage
}) {
  if (usesPackagingEntryPoint()) {
    await obligationsPage.goto(account)
    await obligationsPage.openCertificateHub()
  } else {
    const declaration = await findOnlySubmittedDeclaration(
      request,
      getOrgId(account),
      year
    )
    await csocViewPage.goto(account, declaration.id)
  }
  await csocViewPage.expectLoaded(year)
}

// Opens an already-accepted PRN or PERN, selected by type as in
// prn-accepted-view.spec.js. Nothing is accepted here.
async function openAcceptedPrn({ account, prnType, page, request, prnPage }) {
  skipUnlessPrnsConfigured()
  const prns = await listAcceptedPrns(request, getOrgId(account))
  const prn = prns.find((p) => (p.type === 'PERN' ? 'PERN' : 'PRN') === prnType)
  if (process.env.ENVIRONMENT === 'local') {
    expect(
      prn,
      `The local journey fixture must contain an accepted ${prnType}.`
    ).toBeDefined()
  }
  test.skip(
    !prn,
    `No accepted ${prnType} on this deployed environment; the accepted view was not scanned.`
  )

  const prnUrl = getPrnUrl(account, prn.id, prn.obligationYear)
  await ensureProxySessionForWebKit(page, prnUrl.href)
  await page.goto(prnUrl.href, { timeout: 60_000 })
  await expect(prnPage.heading).toBeVisible()
  await expect(
    page.locator('.govuk-notification-banner--success')
  ).toBeVisible()
}

test.describe('Accessibility testing — CSOC journey', () => {
  test.beforeAll(async () => {
    await resetOrgDeclarations('dp')
    await resetOrgDeclarations('cso')
    await initialiseAccessibilityChecking()
  })

  test.afterAll(async () => {
    generateAccessibilityReports('csoc-journey')
    generateAccessibilityReportIndex()
  })

  test.describe('DP', () => {
    test.use({ storageState: 'playwright/.auth/dp.json' })

    test('scan the four CSOC pages', async ({
      page,
      request,
      landingPage,
      chooseYearPage,
      obligationsPage,
      csocAboutPage,
      csocSubmissionPage,
      csocConfirmationPage,
      csocViewPage
    }) => {
      test.setTimeout(300_000)

      const year = new Date().getFullYear()

      // Navigate from landing to the start of the CSOC journey — these pages
      // are out of scope for the accessibility scan, so we just step through.
      await startCsocJourney({
        account: 'dp',
        year,
        landingPage,
        chooseYearPage,
        obligationsPage,
        csocAboutPage
      })

      await test.step('DP > CSOC About page', async () => {
        await analyseAccessibility(page, 'dp-csoc-about')
      })

      await test.step('DP > CSOC Check-and-submit page', async () => {
        await csocAboutPage.clickContinue()
        await csocSubmissionPage.expectLoaded()
        await analyseAccessibility(page, 'dp-csoc-check-and-submit')
      })

      await test.step('DP > CSOC Confirmation page', async () => {
        await csocSubmissionPage.submit(TEST_USER_NAME)
        await csocConfirmationPage.expectSubmitted(year)
        await analyseAccessibility(page, 'dp-csoc-confirmation')
      })

      // Packaging reaches View through its certificate hub; the direct entry
      // point loads the submitted declaration's view route instead.
      await test.step('DP > CSOC View page', async () => {
        await openCsocView({
          account: 'dp',
          request,
          year,
          obligationsPage,
          csocViewPage
        })
        await analyseAccessibility(page, 'dp-csoc-view')
      })

      await test.step('DP > Assert no accessibility issues', () => {
        assertNoAccessibilityIssues()
      })
    })
  })

  test.describe('CSO', () => {
    test.use({ storageState: 'playwright/.auth/cso.json' })

    test('scan the four CSOC pages', async ({
      page,
      request,
      landingPage,
      chooseYearPage,
      obligationsPage,
      csocAboutPage,
      csocSubmissionPage,
      csocConfirmationPage,
      csocViewPage
    }) => {
      test.setTimeout(300_000)

      const year = new Date().getFullYear()

      // Navigate from landing to the start of the CSOC journey — these pages
      // are out of scope for the accessibility scan, so we just step through.
      await startCsocJourney({
        account: 'cso',
        year,
        landingPage,
        chooseYearPage,
        obligationsPage,
        csocAboutPage
      })

      await test.step('CSO > CSOC About page', async () => {
        await analyseAccessibility(page, 'cso-csoc-about')
      })

      await test.step('CSO > CSOC Check-and-submit page', async () => {
        await csocAboutPage.clickContinue()
        await csocSubmissionPage.expectLoaded()
        await analyseAccessibility(page, 'cso-csoc-check-and-submit')
      })

      await test.step('CSO > CSOC Confirmation page', async () => {
        await csocSubmissionPage.submit(TEST_USER_NAME)
        await csocConfirmationPage.expectSubmitted(year)
        await analyseAccessibility(page, 'cso-csoc-confirmation')
      })

      // Packaging reaches View through its statement hub; the direct entry
      // point loads the submitted declaration's view route instead.
      await test.step('CSO > CSOC View page', async () => {
        await openCsocView({
          account: 'cso',
          request,
          year,
          obligationsPage,
          csocViewPage
        })
        await analyseAccessibility(page, 'cso-csoc-view')
      })

      await test.step('CSO > Assert no accessibility issues', () => {
        assertNoAccessibilityIssues()
      })
    })
  })
})

test.describe('Accessibility testing — Accepted PRN view', () => {
  test.beforeAll(async () => {
    await initialiseAccessibilityChecking()
  })

  test.afterAll(async () => {
    generateAccessibilityReports('prn-accepted-view')
    generateAccessibilityReportIndex()
  })

  for (const { account, label, prnType } of [
    { account: 'dp', label: 'DP', prnType: 'PRN' },
    { account: 'cso', label: 'CSO', prnType: 'PERN' }
  ]) {
    test.describe(label, () => {
      test.use({ storageState: `playwright/.auth/${account}.json` })

      test(`scan the accepted ${prnType} view`, async ({
        page,
        request,
        prnPage
      }) => {
        await test.step(`${label} > Accepted ${prnType} view`, async () => {
          await openAcceptedPrn({ account, prnType, page, request, prnPage })
          await analyseAccessibility(page, `${account}-prn-accepted-view`)
        })

        await test.step(`${label} > Assert no accessibility issues`, () => {
          assertNoAccessibilityIssues()
        })
      })
    })
  }
})
