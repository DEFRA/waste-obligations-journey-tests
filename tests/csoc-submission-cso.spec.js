import { test, expect } from '../fixtures/pages.fixture.js'
import { DECLARATION_STATUS, TEST_USER_NAME } from '../data/csoc.data.js'
import {
  getOrgId,
  listDeclarations,
  setDeclarationStatus
} from '../utils/waste-obligations-api.js'
import { resetOrgDeclarations } from '../utils/test-setup.js'

// CSO twin of csoc-submission-dp.spec.js. Same submit → cancel → resubmit →
// accept lifecycle, but against the Compliance Scheme Operator account.
// Differences vs the producer spec:
//   - storageState comes from cso-auth.setup.js (Playwright/.auth/cso.json)
//   - getOrgId/setDeclarationStatus/resetOrgDeclarations are called with 'cso'
//     so backend ops target the CSO org and submitter
//   - the submission page auto-detects the CSO variant and ticks Regulation 43
const ACCOUNT = 'cso'

test.use({ storageState: 'playwright/.auth/cso.json' })

test.describe.configure({ mode: 'serial' })

test.describe('CSOC lifecycle journey (CSO)', () => {
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
      return findSubmittedDeclarationId()
    }

    const viewCsocViaUi = async () => {
      await obligationsPage.goto()
      await obligationsPage.openCertificateHub()
      await csocViewPage.expectLoaded(year)
    }

    await test.step('Scenario 1: submit declaration A via the UI', async () => {
      firstId = await submitCsoc()
    })

    await test.step('Scenario 2: view declaration A; audit records Submitted', async () => {
      await viewCsocViaUi()
      await csocViewPage.expectOrgIdentity()
      await expectAuditEntry(firstId, { action: DECLARATION_STATUS.Submitted })
    })

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
      await obligationsPage.goto()
      await obligationsPage.expectResubmitCardVisible()
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
      await viewCsocViaUi()
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
      await viewCsocViaUi()
      await csocViewPage.expectOrgIdentity()
      await expectAuditEntry(secondId, { action: DECLARATION_STATUS.Accepted })
    })
  })
})
