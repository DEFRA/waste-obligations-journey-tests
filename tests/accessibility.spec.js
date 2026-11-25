import { test, expect } from '../fixtures/pages.fixture.js'
import { TEST_USER_NAME } from '../data/csoc.data.js'
import {
  getOrgId,
  listAcceptedPrns,
  listAwaitingPrns,
  listRejectedPrns
} from '../utils/waste-obligations-api.js'
import {
  findOnlySubmittedDeclaration,
  resetOrgDeclarations
} from '../utils/test-setup.js'
import {
  getObligationMaterialUrl,
  getObligationsUrl,
  getWasteObligationsFrontendBaseUrl,
  usesPackagingEntryPoint
} from '../utils/journey-entry-point.js'
import {
  expectSeededOnLocal,
  FEATURE_MANAGE_OBLIGATIONS,
  skipUnlessCsocEnabled,
  skipUnlessFeatureFlagEnabled,
  skipUnlessPrnsConfigured
} from '../utils/environment-features.js'
import {
  findStandardSelectablePrn,
  findStandardSelectablePrnsByMaterial,
  noteType,
  PRN_ACCOUNTS,
  resolveAcceptanceYears
} from '../utils/prn-selection.js'
import { getComplianceYear, getJourneyNow } from '../utils/journey-clock.js'
import {
  openAuthenticatedCsoPrnsList,
  openAuthenticatedProducerPrnsList
} from '../utils/prns-list-navigation.js'
import {
  removeYearFilterPrns,
  resetAwaitingPrns,
  seedAwaitingPrns,
  seedsOwnPrns,
  seedYearFilterPrns
} from '../utils/awaiting-prns.js'
import { REJECT_JOURNEY_PRN_NUMBERS } from '../data/prns.data.js'
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
  const prn = prns.find((candidate) => noteType(candidate) === prnType)
  expectSeededOnLocal(prn, `an accepted ${prnType}`)
  test.skip(
    !prn,
    `No accepted ${prnType} on this deployed environment; the accepted view was not scanned.`
  )

  await prnPage.goto(account, prn)
  await prnPage.expectLoadedForAcceptedPrn(prn)
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

  for (const { account, label, storageState, prnType } of PRN_ACCOUNTS) {
    test.describe(label, () => {
      test.use({ storageState })

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

// Opens an already-rejected PRN or PERN. Nothing is rejected here.
async function openRejectedPrn({ account, prnType, request, prnPage }) {
  skipUnlessPrnsConfigured()
  const prns = await listRejectedPrns(request, getOrgId(account))
  const prn = prns.find(
    (candidate) =>
      noteType(candidate) === prnType && candidate.status === 'Rejected'
  )
  expectSeededOnLocal(prn, `a rejected ${prnType}`)
  test.skip(
    !prn,
    `No rejected ${prnType} on this deployed environment; the rejected view was not scanned.`
  )

  await prnPage.goto(account, prn)
  await prnPage.expectRejectedPrnReview(prn)
}

test.describe('Accessibility testing — Rejected PRN view', () => {
  test.beforeAll(async () => {
    await initialiseAccessibilityChecking()
  })

  test.afterAll(async () => {
    generateAccessibilityReports('prn-rejected-view')
    generateAccessibilityReportIndex()
  })

  for (const { account, label, storageState, prnType } of PRN_ACCOUNTS) {
    test.describe(label, () => {
      test.use({ storageState })

      test(`scan the rejected ${prnType} view`, async ({
        page,
        request,
        prnPage
      }) => {
        await test.step(`${label} > Rejected ${prnType} view`, async () => {
          await openRejectedPrn({ account, prnType, request, prnPage })
          await analyseAccessibility(page, `${account}-prn-rejected-view`)
        })

        await test.step(`${label} > Assert no accessibility issues`, () => {
          assertNoAccessibilityIssues()
        })
      })
    })
  }
})

// Opens "Are you sure you want to reject this PRN?" from an awaiting note.
// Nothing is rejected here.
async function openRejectQuestion({
  account,
  prnType,
  request,
  prnPage,
  prnConfirmRejectPage
}) {
  skipUnlessPrnsConfigured()
  const prns = await listAwaitingPrns(request, getOrgId(account))
  // Not the note the reject journey rejects, which may run alongside.
  const prn = prns.find(
    (candidate) =>
      noteType(candidate) === prnType &&
      candidate.number !== REJECT_JOURNEY_PRN_NUMBERS[account]
  )
  expectSeededOnLocal(prn, `an awaiting ${prnType}`)
  test.skip(
    !prn,
    `No ${prnType} awaiting acceptance on this deployed environment; the reject question was not scanned.`
  )

  await prnPage.goto(account, prn)
  await prnPage.rejectButton(prn).click()
  await prnConfirmRejectPage.expectLoaded(prn)
}

test.describe('Accessibility testing — Reject PRN question', () => {
  test.beforeAll(async () => {
    await initialiseAccessibilityChecking()
  })

  test.afterAll(async () => {
    generateAccessibilityReports('prn-confirm-reject')
    generateAccessibilityReportIndex()
  })

  for (const { account, label, storageState, prnType } of PRN_ACCOUNTS) {
    test.describe(label, () => {
      test.use({ storageState })

      // Local stack only: seed the awaiting notes before the scan and remove them after.
      test.beforeEach(() => {
        seedAwaitingPrns(account)
      })

      test.afterEach(async ({ request }) => {
        await resetAwaitingPrns(account, request)
      })

      test(`scan the reject ${prnType} question and its error`, async ({
        page,
        request,
        prnPage,
        prnConfirmRejectPage
      }) => {
        await test.step(`${label} > Reject ${prnType} question`, async () => {
          await openRejectQuestion({
            account,
            prnType,
            request,
            prnPage,
            prnConfirmRejectPage
          })
          await analyseAccessibility(page, `${account}-prn-confirm-reject`)
        })

        await test.step(`${label} > Reject ${prnType} question with no answer`, async () => {
          await prnConfirmRejectPage.continueWithoutChoosing()
          await prnConfirmRejectPage.expectChooseOptionError()
          await analyseAccessibility(
            page,
            `${account}-prn-confirm-reject-error`
          )
        })

        await test.step(`${label} > Assert no accessibility issues`, () => {
          assertNoAccessibilityIssues()
        })
      })
    })
  }
})

const OPEN_PRNS_LIST = {
  dp: openAuthenticatedProducerPrnsList,
  cso: openAuthenticatedCsoPrnsList
}

// Opens "Check your selection before accepting" (MO-470, with MO-471's
// Accept) for a paper and a glass other PRN, so it shows two tables. Nothing
// is accepted here.
async function openCheckSelection({
  account,
  page,
  request,
  prnsListPage,
  prnsCheckSelectionPage
}) {
  skipUnlessPrnsConfigured()
  const year = getComplianceYear()
  const prns = findStandardSelectablePrnsByMaterial(
    await listAwaitingPrns(request, getOrgId(account)),
    ['Paper', 'Glass']
  )
  expectSeededOnLocal(
    prns.Paper,
    `a standard ${year} paper PRN awaiting acceptance`
  )
  expectSeededOnLocal(
    prns.Glass,
    `a standard ${year} glass other PRN awaiting acceptance`
  )
  test.skip(
    !prns.Paper || !prns.Glass,
    'No standard paper and glass other PRNs awaiting acceptance on this deployed environment; the review page was not scanned.'
  )

  await OPEN_PRNS_LIST[account]({ page, prnsListPage }, year)
  await prnsListPage.selectPrn(prns.Paper.number)
  await prnsListPage.selectPrn(prns.Glass.number)
  await prnsListPage.clickAcceptSelected()
  await prnsCheckSelectionPage.expectLoaded()
}

test.describe('Accessibility testing — Check selection before accepting', () => {
  test.beforeAll(async () => {
    await initialiseAccessibilityChecking()
  })

  test.afterAll(async () => {
    generateAccessibilityReports('prns-check-selection')
    generateAccessibilityReportIndex()
  })

  for (const { account, label, storageState } of PRN_ACCOUNTS) {
    test.describe(label, () => {
      test.use({ storageState })

      // Local stack only: seed the awaiting PRNs before the scan and remove them after.
      test.beforeEach(() => {
        seedAwaitingPrns(account)
      })

      test.afterEach(async ({ request }) => {
        await resetAwaitingPrns(account, request)
      })

      test('MO-471 AC1 — scan the review page with its Accept button', async ({
        page,
        request,
        prnsListPage,
        prnsCheckSelectionPage
      }) => {
        await test.step(`${label} > Check selection before accepting`, async () => {
          await openCheckSelection({
            account,
            page,
            request,
            prnsListPage,
            prnsCheckSelectionPage
          })
          await analyseAccessibility(page, `${account}-prns-check-selection`)
        })

        await test.step(`${label} > Assert no accessibility issues`, () => {
          assertNoAccessibilityIssues()
        })
      })
    })
  }
})

// The CDP obligations pages are scanned on the CDP frontend directly, with
// Manage obligations on.
function skipUnlessCdpObligations() {
  skipUnlessFeatureFlagEnabled(FEATURE_MANAGE_OBLIGATIONS)
  test.skip(
    usesPackagingEntryPoint(),
    'The CDP obligations pages are scanned on the CDP frontend directly'
  )
}

const MATERIAL_CALCULATION_PAGES = [
  { slug: 'aluminium', name: 'aluminium' },
  { slug: 'glass', name: 'glass' }
]

test.describe('Accessibility testing — Material calculation pages', () => {
  test.beforeAll(async () => {
    await initialiseAccessibilityChecking()
  })

  test.afterAll(async () => {
    generateAccessibilityReports('material-calculation')
    generateAccessibilityReportIndex()
  })

  for (const { account, label, storageState } of PRN_ACCOUNTS) {
    test.describe(label, () => {
      test.use({ storageState })

      test.beforeEach(() => {
        skipUnlessCdpObligations()
      })

      for (const { slug, name } of MATERIAL_CALCULATION_PAGES) {
        test(`scan the ${name} calculation page`, async ({
          page,
          materialCalculationPage
        }) => {
          const year = getComplianceYear()

          await test.step(`${label} > ${name} calculation page`, async () => {
            await page.goto(
              new URL(
                getObligationMaterialUrl(account, slug, year).toString(),
                getWasteObligationsFrontendBaseUrl()
              ).toString(),
              { timeout: 60_000 }
            )
            await materialCalculationPage.expectLoadedFor(year, name)
            await analyseAccessibility(page, `${account}-${slug}-calculation`)
          })

          await test.step(`${label} > Assert no accessibility issues`, () => {
            assertNoAccessibilityIssues()
          })
        })
      }
    })
  }
})

// 2025's obligations were met outside the service, so its year opens the
// compliance record instead of Manage obligations.
const COMPLIANCE_RECORD_YEAR = 2025

test.describe('Accessibility testing — Choose a year and Manage obligations', () => {
  test.beforeAll(async () => {
    await initialiseAccessibilityChecking()
  })

  test.afterAll(async () => {
    generateAccessibilityReports('manage-obligations')
    generateAccessibilityReportIndex()
  })

  for (const { account, label, storageState } of PRN_ACCOUNTS) {
    test.describe(label, () => {
      test.use({ storageState })

      test.beforeEach(() => {
        skipUnlessCdpObligations()
      })

      test('scan Choose a year and its error, Manage obligations and the compliance record', async ({
        page,
        chooseYearPage,
        obligationsPage,
        complianceRecordPage
      }) => {
        const year = getComplianceYear()

        await test.step(`${label} > Choose a year`, async () => {
          await chooseYearPage.goto(account)
          await chooseYearPage.expectLoaded()
          await analyseAccessibility(page, `${account}-choose-year`)
        })

        await test.step(`${label} > Choose a year with no year chosen`, async () => {
          await chooseYearPage.clickContinue()
          await chooseYearPage.expectSelectYearError()
          await analyseAccessibility(page, `${account}-choose-year-error`)
        })

        await test.step(`${label} > Manage your ${year} recycling obligations`, async () => {
          await page.goto(getObligationsUrl(account, year).href, {
            timeout: 60_000
          })
          await obligationsPage.expectLoadedForYear(year)
          await analyseAccessibility(page, `${account}-manage-obligations`)
        })

        await test.step(`${label} > ${COMPLIANCE_RECORD_YEAR} compliance record`, async () => {
          await page.goto(
            getObligationsUrl(account, COMPLIANCE_RECORD_YEAR).href,
            { timeout: 60_000 }
          )
          await complianceRecordPage.expectLoadedFor(
            COMPLIANCE_RECORD_YEAR,
            account
          )
          await analyseAccessibility(page, `${account}-compliance-record`)
        })

        await test.step(`${label} > Assert no accessibility issues`, () => {
          assertNoAccessibilityIssues()
        })
      })
    })
  }
})

test.describe('Accessibility testing — PRNs list', () => {
  test.beforeAll(async () => {
    await initialiseAccessibilityChecking()
  })

  test.afterAll(async () => {
    generateAccessibilityReports('prns-list')
    generateAccessibilityReportIndex()
  })

  for (const { account, label, storageState } of PRN_ACCOUNTS) {
    test.describe(label, () => {
      test.use({ storageState })

      // Local stack only: seed the awaiting notes before the scan and remove them after.
      test.beforeEach(() => {
        seedAwaitingPrns(account)
      })

      test.afterEach(async ({ request }) => {
        await resetAwaitingPrns(account, request)
      })

      test('scan the PRNs list', async ({ page, prnsListPage }) => {
        skipUnlessPrnsConfigured()

        await test.step(`${label} > PRNs list`, async () => {
          await OPEN_PRNS_LIST[account](
            { page, prnsListPage },
            getComplianceYear()
          )
          await analyseAccessibility(page, `${account}-prns-list`)
        })

        await test.step(`${label} > Assert no accessibility issues`, () => {
          assertNoAccessibilityIssues()
        })
      })

      // Accept selected is offered only when a note can be selected.
      test('scan the PRNs list error when nothing is selected', async ({
        page,
        request,
        prnsListPage
      }) => {
        skipUnlessPrnsConfigured()
        const year = getComplianceYear()
        const prn = findStandardSelectablePrn(
          await listAwaitingPrns(request, getOrgId(account))
        )
        expectSeededOnLocal(prn, `a standard ${year} note awaiting acceptance`)
        test.skip(
          !prn,
          'No standard note awaiting acceptance on this deployed environment, so Accept selected is not offered; the error was not scanned.'
        )

        await test.step(`${label} > PRNs list with nothing selected`, async () => {
          await OPEN_PRNS_LIST[account]({ page, prnsListPage }, year)
          await prnsListPage.expectNoPrnSelected()
          await prnsListPage.clickAcceptSelected()
          await prnsListPage.expectSelectOneOrMoreError()
          await analyseAccessibility(page, `${account}-prns-list-error`)
        })

        await test.step(`${label} > Assert no accessibility issues`, () => {
          assertNoAccessibilityIssues()
        })
      })
    })
  }
})

// A standard note of the type awaiting acceptance, other than the one the
// reject journey rejects.
async function findAwaitingNote({ account, prnType, request }) {
  const prns = await listAwaitingPrns(request, getOrgId(account))

  return findStandardSelectablePrn(
    prns.filter(
      (candidate) =>
        noteType(candidate) === prnType &&
        candidate.number !== REJECT_JOURNEY_PRN_NUMBERS[account]
    )
  )
}

test.describe('Accessibility testing — Awaiting PRN and accept question', () => {
  test.beforeAll(async () => {
    await initialiseAccessibilityChecking()
  })

  test.afterAll(async () => {
    generateAccessibilityReports('prn-awaiting')
    generateAccessibilityReportIndex()
  })

  for (const { account, label, storageState, prnType } of PRN_ACCOUNTS) {
    test.describe(label, () => {
      test.use({ storageState })

      // Local stack only: seed the awaiting notes before the scan and remove them after.
      test.beforeEach(() => {
        seedAwaitingPrns(account)
      })

      test.afterEach(async ({ request }) => {
        await resetAwaitingPrns(account, request)
      })

      // Nothing is accepted: the scan stops at the question.
      test(`scan the awaiting ${prnType} and the accept question`, async ({
        page,
        request,
        prnPage,
        prnConfirmAcceptPage
      }) => {
        skipUnlessPrnsConfigured()
        const prn = await findAwaitingNote({ account, prnType, request })
        expectSeededOnLocal(prn, `a standard ${prnType} awaiting acceptance`)
        test.skip(
          !prn,
          `No standard ${prnType} awaiting acceptance on this deployed environment; the pages were not scanned.`
        )

        await test.step(`${label} > ${prnType} awaiting acceptance`, async () => {
          await prnPage.goto(account, prn)
          await prnPage.expectLoadedForAwaitingPrn(prn)
          await analyseAccessibility(page, `${account}-prn-awaiting`)
        })

        await test.step(`${label} > Accept ${prnType} question`, async () => {
          await prnPage.acceptButton(prn).click()
          await prnConfirmAcceptPage.expectLoaded(prn)
          await analyseAccessibility(page, `${account}-prn-confirm-accept`)
        })

        await test.step(`${label} > Assert no accessibility issues`, () => {
          assertNoAccessibilityIssues()
        })
      })
    })
  }
})

test.describe('Accessibility testing — Choose a year to accept', () => {
  test.beforeAll(async () => {
    await initialiseAccessibilityChecking()
  })

  test.afterAll(async () => {
    generateAccessibilityReports('prn-choose-year')
    generateAccessibilityReportIndex()
  })

  for (const { account, label, storageState } of PRN_ACCOUNTS) {
    test.describe(label, () => {
      test.use({ storageState })

      // Local stack only: seed the December waste notes before the scan and remove them after.
      test.beforeEach(() => {
        seedYearFilterPrns(account)
      })

      test.afterEach(() => {
        removeYearFilterPrns(account)
      })

      // Nothing is accepted: the scan stops at the year question.
      test('scan the year question and its error', async ({
        page,
        request,
        prnPage,
        prnChooseYearPage
      }) => {
        skipUnlessPrnsConfigured()
        const now = getJourneyNow()
        const prn = (await listAwaitingPrns(request, getOrgId(account))).find(
          (candidate) =>
            candidate.decemberWaste &&
            resolveAcceptanceYears(candidate, now).length > 1
        )
        test.skip(
          !prn,
          'The year is chosen only for December waste from 1 December to 31 January; no note awaiting acceptance can count towards two years at this date.'
        )

        await test.step(`${label} > Which year to accept ${prn.number} towards`, async () => {
          await prnPage.goto(account, prn)
          await prnPage.acceptButton(prn).click()
          await prnChooseYearPage.expectLoaded(prn)
          await analyseAccessibility(page, `${account}-prn-choose-year`)
        })

        await test.step(`${label} > Year question with no year chosen`, async () => {
          await prnChooseYearPage.continueWithoutChoosing()
          await prnChooseYearPage.expectSelectYearError()
          await analyseAccessibility(page, `${account}-prn-choose-year-error`)
        })

        await test.step(`${label} > Assert no accessibility issues`, () => {
          assertNoAccessibilityIssues()
        })
      })
    })
  }
})

test.describe('Accessibility testing — Accepted and rejected confirmations (changes data)', () => {
  test.beforeAll(async () => {
    await initialiseAccessibilityChecking()
  })

  test.afterAll(async () => {
    generateAccessibilityReports('prn-confirmations')
    generateAccessibilityReportIndex()
  })

  for (const { account, label, storageState } of PRN_ACCOUNTS) {
    test.describe(label, () => {
      test.use({ storageState })

      // Local stack only: seed the awaiting notes before the scan and remove them after,
      // which also undoes the accept and the reject.
      test.beforeEach(() => {
        seedAwaitingPrns(account)
      })

      test.afterEach(async ({ request }) => {
        await resetAwaitingPrns(account, request)
      })

      test('accept one note and reject another, and scan both confirmations', async ({
        page,
        request,
        prnPage,
        prnConfirmRejectPage
      }) => {
        skipUnlessPrnsConfigured()
        test.skip(
          !seedsOwnPrns(),
          'Accepting and rejecting change PRN data, so they run only where the run seeds and removes its own notes.'
        )
        const awaiting = await listAwaitingPrns(request, getOrgId(account))
        const toAccept = findStandardSelectablePrn(awaiting)
        const toReject = findStandardSelectablePrn(
          awaiting.filter((candidate) => candidate.id !== toAccept?.id)
        )
        expectSeededOnLocal(toAccept, 'a standard note to accept')
        expectSeededOnLocal(toReject, 'a second standard note to reject')

        await test.step(`${label} > Accept ${toAccept.number} and see the confirmation`, async () => {
          await prnPage.goto(account, toAccept)
          await prnPage.accept(toAccept)
          await prnPage.expectAcceptedConfirmation(
            toAccept,
            toAccept.obligationYear
          )
          await analyseAccessibility(
            page,
            `${account}-prn-accepted-confirmation`
          )
        })

        await test.step(`${label} > Reject ${toReject.number} and see the confirmation`, async () => {
          await prnPage.goto(account, toReject)
          await prnPage.rejectButton(toReject).click()
          await prnConfirmRejectPage.expectLoaded(toReject)
          await prnConfirmRejectPage.reject(toReject)
          await prnConfirmRejectPage.expectRejectionConfirmation(toReject)
          await analyseAccessibility(
            page,
            `${account}-prn-rejected-confirmation`
          )
        })

        await test.step(`${label} > Assert no accessibility issues`, () => {
          assertNoAccessibilityIssues()
        })
      })
    })
  }
})
