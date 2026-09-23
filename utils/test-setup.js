import { request as apiRequest, expect } from '@playwright/test'
import { DECLARATION_STATUS } from '../data/csoc.data.js'
import {
  deleteAllDeclarations,
  getOrgId,
  listDeclarations
} from './waste-obligations-api.js'

// Wipes the shared backend org so a spec starts from a known-empty year.
// There is no snapshot restore: callers that need a submitted certificate
// recreate it through the UI after this reset.
export async function resetOrgDeclarations(
  account = 'dp',
  obligationYear = new Date().getFullYear()
) {
  const apiContext = await apiRequest.newContext({ ignoreHTTPSErrors: true })
  let primaryError
  try {
    await deleteAllDeclarations(apiContext, getOrgId(account), obligationYear)
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

// Asserts there's exactly one Submitted declaration and returns it. Used by
// the accessibility and security specs to anchor the mid-test cancel step.
export async function findOnlySubmittedDeclaration(request, orgId, year) {
  const declarations = await listDeclarations(request, orgId, year)
  const submitted = declarations.filter(
    (d) => d.status === DECLARATION_STATUS.Submitted
  )
  expect(submitted).toHaveLength(1)
  return submitted[0]
}
