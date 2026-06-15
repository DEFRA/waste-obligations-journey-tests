import { request as apiRequest } from '@playwright/test'
import { test, expect } from '../fixtures/pages.fixture.js'
import { DECLARATION_STATUS, TEST_USER_NAME } from '../data/csoc.data.js'
import {
  deleteAllDeclarations,
  getOrgId,
  listDeclarations,
  setDeclarationStatus
} from '../utils/waste-obligations-api.js'

// Shared backend org: keep serial so a single worker owns the lifecycle state.
// Declaration status is not asserted in the UI; the audit trail (see
// expectAuditEntry) is the authoritative state-change check.
test.describe.configure({ mode: 'serial' })

async function resetOrgDeclarations() {
  const apiContext = await apiRequest.newContext({ ignoreHTTPSErrors: true })
  let primaryError
  try {
    await deleteAllDeclarations(
      apiContext,
      getOrgId(),
      new Date().getFullYear()
    )
  } catch (error) {
    primaryError = error
  }
  try {
    await apiContext.dispose()
  } catch (disposeError) {
    if (!primaryError) primaryError = disposeError
  }
  if (primaryError) throw primaryError
}

test.describe('CSOC lifecycle journey', () => {
  test.beforeAll(resetOrgDeclarations)
  test.afterAll(resetOrgDeclarations)

  test('Submit → view → accept → cancel → resubmit lifecycle', async ({
    request,
    landingPage,
    obligationsPage,
    csocAboutPage,
    csocSubmissionPage,
    csocCertificateHubPage,
    csocConfirmationPage,
    csocViewPage
  }) => {
    const orgId = getOrgId()
    const year = new Date().getFullYear()
    let firstId
    let secondId
    let obligationsRows

    const expectAuditEntry = async (declarationId, entry) => {
      const declarations = await listDeclarations(request, orgId, year)
      const declaration = declarations.find((d) => d.id === declarationId)
      expect(
        declaration,
        `declaration ${declarationId} missing from list`
      ).toBeDefined()
      expect(declaration.audit).toEqual(
        expect.arrayContaining([expect.objectContaining(entry)])
      )
    }

    const submitCsoc = async () => {
      await landingPage.goto()
      await landingPage.goToObligations()
      await obligationsPage.expectLoaded()
      obligationsRows = await obligationsPage.readObligationsTable()
      expect(obligationsRows.length).toBeGreaterThan(0)
      await obligationsPage.startCsocSubmission()
      await csocAboutPage.expectLoaded()
      await csocAboutPage.expectRegulatorEmail()
      await csocAboutPage.clickContinue()
      await csocSubmissionPage.expectLoaded()
      await csocSubmissionPage.expectOrganisationDetails()
      await csocSubmissionPage.expectObligationsMet()
      await csocSubmissionPage.submit(TEST_USER_NAME)
      await csocConfirmationPage.expectSubmitted(year)
      return csocConfirmationPage.getDeclarationId()
    }

    const viewCsocViaUi = async (declarationId) => {
      await obligationsPage.goto()
      await obligationsPage.openCertificateHub(declarationId)
      await csocCertificateHubPage.expectLoaded()
      await csocCertificateHubPage.goToConfirmation()
      await csocConfirmationPage.expectSubmitted(year)
      await csocConfirmationPage.goToCertificateView()
      await csocViewPage.expectLoaded(year)
    }

    await test.step('Scenario 1: submit a declaration via the UI', async () => {
      firstId = await submitCsoc()
    })

    await test.step('Scenario 2: view declaration; audit records Submitted', async () => {
      await viewCsocViaUi(firstId)
      await csocViewPage.expectOrgIdentity()
      await expectAuditEntry(firstId, { action: DECLARATION_STATUS.Submitted })
    })

    await test.step('Scenario 3: PATCH status to Accepted', async () => {
      await setDeclarationStatus(
        request,
        orgId,
        firstId,
        DECLARATION_STATUS.Accepted
      )
    })

    await test.step('Scenario 4: view declaration; audit reflects Accepted', async () => {
      await viewCsocViaUi(firstId)
      await csocViewPage.expectOrgIdentity()
      await expectAuditEntry(firstId, { action: DECLARATION_STATUS.Accepted })
    })

    await test.step('Scenario 5: PATCH status to Cancelled', async () => {
      await setDeclarationStatus(
        request,
        orgId,
        firstId,
        DECLARATION_STATUS.Cancelled,
        'Journey-test cancel'
      )
    })

    await test.step('Scenario 6: obligations page shows resubmit; audit reflects Cancelled with reason', async () => {
      await obligationsPage.goto()
      await obligationsPage.expectResubmitCardVisible()
      await expectAuditEntry(firstId, {
        action: DECLARATION_STATUS.Cancelled,
        reason: 'Journey-test cancel'
      })
    })

    await test.step('Scenario 7: resubmit a declaration via the UI', async () => {
      secondId = await submitCsoc()
      expect(secondId).not.toBe(firstId)
      const declarations = await listDeclarations(request, orgId, year)
      expect(declarations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: secondId,
            status: DECLARATION_STATUS.Submitted
          }),
          expect.objectContaining({
            id: firstId,
            status: DECLARATION_STATUS.Cancelled
          })
        ])
      )
    })

    await test.step('Scenario 8: view resubmitted declaration; audit records Submitted', async () => {
      await viewCsocViaUi(secondId)
      await csocViewPage.expectOrgIdentity()
      await expectAuditEntry(secondId, { action: DECLARATION_STATUS.Submitted })
    })
  })
})
