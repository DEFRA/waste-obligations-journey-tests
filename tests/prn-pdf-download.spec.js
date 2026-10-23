import { test, expect } from '../fixtures/pages.fixture.js'
import {
  expectSeededOnLocal,
  skipUnlessPrnsConfigured
} from '../utils/environment-features.js'
import {
  getOrgId,
  listAcceptedPrns,
  listAwaitingPrns,
  listRejectedPrns
} from '../utils/waste-obligations-api.js'
import { expectPdf } from '../utils/pdf-download.js'
import {
  findStandardSelectablePrn,
  noteType,
  PRN_ACCOUNTS
} from '../utils/prn-selection.js'
import { labelsExcludedFromPdf } from '../pages/prn-page.js'

// MO-442: download the PRN page as a PDF, named after the PRN number, from the
// awaiting, accepted, rejected and acceptance-confirmation views.
//
// Nothing is accepted here, except in the opt-in confirmation journey below.
// The note on each view is chosen by type from the backend, so the journeys
// work with the CI WireMock data and with the full local stack: DP opens PRNs,
// CSO opens PERNs, and every run covers both wordings.
//
// The PDF is a picture of the page, so its content is read back with OCR when
// `pdftoppm` and `tesseract` are installed. Without them a journey still
// checks the filename and that the download is a real PDF, and says so.

function expectPrnPdf(download, prn, options = {}) {
  return expectPdf(download, prn, {
    ...options,
    excludes: labelsExcludedFromPdf(prn)
  })
}

for (const { account, label, storageState, prnType } of PRN_ACCOUNTS) {
  test.describe(`PRN PDF download: ${prnType} (${label})`, () => {
    test.use({ storageState })

    test('awaiting acceptance: the link is at the base of the page and downloads <number>.pdf', async ({
      request,
      prnPage
    }) => {
      skipUnlessPrnsConfigured()

      const prn = (await listAwaitingPrns(request, getOrgId(account))).find(
        (candidate) => noteType(candidate) === prnType
      )
      expectSeededOnLocal(prn, `an awaiting ${prnType}`)
      test.skip(!prn, `No awaiting ${prnType} on this deployed environment`)

      await test.step(`open awaiting ${prnType} ${prn.number}`, async () => {
        await prnPage.goto(account, prn)
        await prnPage.dismissCookieBannerIfShown()
        await prnPage.expectLoadedForAwaitingPrn(prn)
      })

      await test.step('the link is at the base of the page', async () => {
        await prnPage.expectPdfControlAtBase()
      })

      await test.step('it downloads a PDF named after the number', async () => {
        await expectPrnPdf(await prnPage.download(prnPage.pdfButton()), prn)
      })
    })

    test('accepted: the link is at the base of the page and the PDF says which year it was accepted towards', async ({
      request,
      prnPage
    }) => {
      skipUnlessPrnsConfigured()

      const prn = (await listAcceptedPrns(request, getOrgId(account))).find(
        (candidate) => noteType(candidate) === prnType
      )
      expectSeededOnLocal(prn, `an accepted ${prnType}`)
      test.skip(!prn, `No accepted ${prnType} on this deployed environment`)

      await test.step(`open accepted ${prnType} ${prn.number}`, async () => {
        await prnPage.goto(account, prn)
        await prnPage.dismissCookieBannerIfShown()
        await prnPage.expectLoadedForAcceptedPrn(prn)
      })

      await test.step('the link is at the base of the page', async () => {
        await prnPage.expectPdfControlAtBase()
      })

      await test.step('it downloads a PDF with the accepted year', async () => {
        await expectPrnPdf(await prnPage.download(prnPage.pdfButton()), prn, {
          includes: [
            `Accepted towards ${prn.obligationYear} recycling obligations`
          ]
        })
      })
    })

    test('rejected: the link is in the green banner and downloads <number>.pdf', async ({
      request,
      prnPage
    }) => {
      skipUnlessPrnsConfigured()

      const prn = (await listRejectedPrns(request, getOrgId(account))).find(
        (candidate) =>
          noteType(candidate) === prnType && candidate.status === 'Rejected'
      )
      expectSeededOnLocal(prn, `a rejected ${prnType}`)
      test.skip(!prn, `No rejected ${prnType} on this deployed environment`)

      await test.step(`open rejected ${prnType} ${prn.number}`, async () => {
        await prnPage.goto(account, prn)
        await prnPage.dismissCookieBannerIfShown()
        await prnPage.expectLoadedForRejectedPrn(prn)
      })

      await test.step('the link is within the green banner', async () => {
        await prnPage.expectPdfControlInGreenBanner()
      })

      await test.step('it downloads a PDF named after the number', async () => {
        await expectPrnPdf(await prnPage.download(prnPage.pdfButton()), prn)
      })
    })
  })
}

// Accepting changes the note for good, and the PRNs list journeys rely on a
// standard awaiting note, so this runs only when asked for:
//   JOURNEY_ACCEPT_PRN=true ENVIRONMENT=local ...
// Reset the seeded notes afterwards (epr-local-environment:
// compose/epr-prn-common-backend-migrations/apply-extra-prn-scenarios.sh).
test.describe('PRN PDF download: acceptance confirmation (DP, changes data)', () => {
  test.use({ storageState: 'playwright/.auth/dp.json' })

  test('after accepting, the link is in the green banner and the PDF says it was accepted', async ({
    request,
    prnPage
  }) => {
    skipUnlessPrnsConfigured()
    test.skip(
      process.env.JOURNEY_ACCEPT_PRN !== 'true',
      'Accepts a note: set JOURNEY_ACCEPT_PRN=true on LOCAL and reset the seeded notes afterwards'
    )

    const prn = findStandardSelectablePrn(
      (await listAwaitingPrns(request, getOrgId('dp'))).filter(
        (candidate) => noteType(candidate) === 'PRN'
      )
    )
    expect(prn, 'A standard awaiting PRN is needed').toBeDefined()

    await test.step(`accept ${prn.number}`, async () => {
      await prnPage.goto('dp', prn)
      await prnPage.dismissCookieBannerIfShown()
      await prnPage.accept(prn)
      await prnPage.dismissCookieBannerIfShown()
    })

    await test.step('the link is within the green confirmation banner', async () => {
      await prnPage.expectPdfControlInGreenBanner()
    })

    await test.step('it downloads a PDF that says it was accepted, without the green box', async () => {
      await expectPrnPdf(await prnPage.download(prnPage.pdfButton()), prn, {
        includes: [
          `Accepted towards ${prn.obligationYear} recycling obligations`
        ]
      })
    })
  })
})
