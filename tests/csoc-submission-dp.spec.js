import { test, expect } from '../fixtures/pages.fixture.js'
import { DECLARATION_STATUS, TEST_USER_NAME } from '../data/csoc.data.js'
import {
  getOrgId,
  listDeclarations,
  setDeclarationStatus
} from '../utils/waste-obligations-api.js'
import { usesPackagingEntryPoint } from '../utils/journey-entry-point.js'
import { resetOrgDeclarations } from '../utils/test-setup.js'

// Direct Producer journey. Mirrors the CSO twin in csoc-submission-cso.spec.js
// but pins the DP storage state and threads 'dp' through every backend helper.
const ACCOUNT = 'dp'

test.use({ storageState: 'playwright/.auth/dp.json' })

// Shared backend org: keep serial so a single worker owns the lifecycle state.
// Declaration status is not asserted in the UI; the audit trail (see
// expectAuditEntry) is the authoritative state-change check.
test.describe.configure({ mode: 'serial' })

test.describe('CSOC lifecycle journey (DP)', () => {
  test.beforeAll(() => resetOrgDeclarations(ACCOUNT))

  test('Submit → cancel → resubmit → accept lifecycle', async ({
    request,
    landingPage,
    obligationsPage,
    csocAboutPage,
    csocSubmissionPage,
    csocConfirmationPage,
    csocViewPage
  }) => {
    const orgId = getOrgId(ACCOUNT)
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

    const findSubmittedDeclarationId = async () => {
      const list = await listDeclarations(request, orgId, year)
      const submitted = list.filter(
        (d) => d.status === DECLARATION_STATUS.Submitted
      )
      if (submitted.length !== 1) {
        throw new Error(
          `Expected exactly one Submitted declaration for org ${orgId} year ${year}; got ${submitted.length}`
        )
      }
      return submitted[0].id
    }

    const submitCsoc = async () => {
      await landingPage.goto(ACCOUNT)
      if (usesPackagingEntryPoint()) {
        await landingPage.goToObligations()
        await obligationsPage.expectLoaded()
        obligationsRows = await obligationsPage.readObligationsTable()
        expect(obligationsRows.length).toBeGreaterThan(0)
        await obligationsPage.startCsocSubmission()
      }
      await csocAboutPage.expectLoaded()
      await csocAboutPage.expectRegulatorEmail()
      await csocAboutPage.clickContinue()
      await csocSubmissionPage.expectLoaded()
      await csocSubmissionPage.expectOrganisationDetails()
      await csocSubmissionPage.submit(TEST_USER_NAME)
      await csocConfirmationPage.expectSubmitted(year)
      return findSubmittedDeclarationId()
    }

    const viewCsocViaUi = async (declarationId) => {
      if (usesPackagingEntryPoint()) {
        await obligationsPage.goto(ACCOUNT)
        await obligationsPage.openCertificateHub()
      } else {
        await csocViewPage.goto(ACCOUNT, declarationId)
      }
      await csocViewPage.expectLoaded(year)
    }

    await test.step('Scenario 1: submit declaration A via the UI', async () => {
      firstId = await submitCsoc()
    })

    await test.step('Scenario 2: view declaration A; audit records Submitted', async () => {
      await viewCsocViaUi(firstId)
      await csocViewPage.expectOrgIdentity()
      await expectAuditEntry(firstId, { action: DECLARATION_STATUS.Submitted })
    })

    // Backend only permits Submitted → Cancelled (Accepted is terminal), so
    // Cancel must run before the Accept further down this lifecycle.
    await test.step('Scenario 3: PATCH declaration A to Cancelled', async () => {
      await setDeclarationStatus(
        request,
        orgId,
        firstId,
        DECLARATION_STATUS.Cancelled,
        'Journey-test cancel',
        ACCOUNT
      )
    })

    await test.step('Scenario 4: obligations page shows resubmit; audit reflects Cancelled with reason', async () => {
      if (usesPackagingEntryPoint()) {
        await obligationsPage.goto(ACCOUNT)
        await obligationsPage.expectResubmitCardVisible()
      } else {
        await landingPage.goto(ACCOUNT)
        await csocAboutPage.expectLoaded()
        await csocAboutPage.expectCanSubmit()
      }
      await expectAuditEntry(firstId, {
        action: DECLARATION_STATUS.Cancelled,
        reason: 'Journey-test cancel'
      })
    })

    await test.step('Scenario 5: resubmit declaration B via the UI', async () => {
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

    await test.step('Scenario 6: view declaration B; audit records Submitted', async () => {
      await viewCsocViaUi(secondId)
      await csocViewPage.expectOrgIdentity()
      await expectAuditEntry(secondId, { action: DECLARATION_STATUS.Submitted })
    })

    await test.step('Scenario 7: PATCH declaration B to Accepted', async () => {
      await setDeclarationStatus(
        request,
        orgId,
        secondId,
        DECLARATION_STATUS.Accepted,
        undefined,
        ACCOUNT
      )
    })

    await test.step('Scenario 8: view declaration B; audit reflects Accepted', async () => {
      await viewCsocViaUi(secondId)
      await csocViewPage.expectOrgIdentity()
      await expectAuditEntry(secondId, { action: DECLARATION_STATUS.Accepted })
    })
  })
})
