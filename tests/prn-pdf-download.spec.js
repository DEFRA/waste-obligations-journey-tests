import { test, expect } from '../fixtures/pages.fixture.js'
import { getPrnUrl } from '../utils/journey-entry-point.js'
import { ensureProxySessionForWebKit } from '../utils/proxy-session.js'
import { skipUnlessPrnsConfigured } from '../utils/environment-features.js'
import {
  getOrgId,
  listAcceptedPrns,
  listAwaitingPrns,
  listRejectedPrns
} from '../utils/waste-obligations-api.js'
import {
  isOcrAvailable,
  looksLikePdf,
  mentions,
  ocrPdf,
  pdfPageCount,
  readFileBytes
} from '../utils/pdf-download.js'

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

const ACCOUNTS = [
  {
    account: 'dp',
    label: 'DP',
    storageState: 'playwright/.auth/dp.json',
    prnType: 'PRN'
  },
  {
    account: 'cso',
    label: 'CSO',
    storageState: 'playwright/.auth/cso.json',
    prnType: 'PERN'
  }
]

const typeOf = (prn) => (prn.type === 'PERN' ? 'PERN' : 'PRN')

// What the PDF must leave out: the action buttons and the download control.
const EXCLUDED_FROM_PDF = [
  'Accept this',
  'Reject this',
  'Download this',
  'Yes, accept'
]

const ocrAvailable = isOcrAvailable()

// ENVIRONMENT=local (and the shared Docker action) seed awaiting and accepted
// notes, so a missing one fails there; deployed targets are not guaranteed to
// have them, so the journey skips. Kept outside the test body for
// playwright/no-conditional-in-test.
function expectSeededOnLocal(prn, description) {
  if (process.env.ENVIRONMENT === 'local') {
    expect(
      prn,
      `The local journey fixture must contain ${description}.`
    ).toBeDefined()
  }
}

async function openPrn({ page, prnPage }, account, prn) {
  const url = getPrnUrl(account, prn.id, prn.obligationYear)

  await ensureProxySessionForWebKit(page, url.href)
  await page.goto(url.href, { timeout: 60_000 })
  await expect(page).toHaveURL((current) => current.pathname === url.pathname)
  await prnPage.dismissCookieBannerIfShown()
}

// The filename and that the download is a real PDF; the content too, with OCR.
async function expectPdf({ filename, file }, prn, { includes = [] } = {}) {
  expect(filename, 'The PDF is named after the PRN number').toBe(
    `${prn.number}.pdf`
  )

  const bytes = readFileBytes(file)
  expect(looksLikePdf(bytes), 'The download is a PDF').toBe(true)
  expect(pdfPageCount(bytes), 'The PDF has at least one page').toBeGreaterThan(
    0
  )

  await expectPdfContent(file, prn, includes)
}

async function expectPdfContent(file, prn, includes) {
  test.info().annotations.push({
    type: 'pdf-content',
    description: ocrAvailable
      ? 'Content read back with OCR'
      : 'pdftoppm or tesseract is not installed: the PDF content was not checked'
  })

  if (!ocrAvailable) {
    return
  }

  const text = ocrPdf(file)

  expect(mentions(text, prn.number, 2), `The PDF shows ${prn.number}`).toBe(
    true
  )
  expect(
    mentions(text, String(prn.tonnage)),
    `The PDF shows ${prn.tonnage} tonnes`
  ).toBe(true)

  for (const wanted of includes) {
    expect(mentions(text, wanted, 3), `The PDF says "${wanted}"`).toBe(true)
  }

  for (const excluded of EXCLUDED_FROM_PDF) {
    expect(mentions(text, excluded), `The PDF leaves out "${excluded}"`).toBe(
      false
    )
  }
}

for (const { account, label, storageState, prnType } of ACCOUNTS) {
  test.describe(`PRN PDF download: ${prnType} (${label})`, () => {
    test.use({ storageState })

    test('awaiting acceptance: the link is at the base of the page and downloads <number>.pdf', async ({
      page,
      request,
      prnPage
    }) => {
      skipUnlessPrnsConfigured()

      const prn = (await listAwaitingPrns(request, getOrgId(account))).find(
        (p) => typeOf(p) === prnType
      )
      expectSeededOnLocal(prn, `an awaiting ${prnType}`)
      test.skip(!prn, `No awaiting ${prnType} on this deployed environment`)

      await test.step(`open awaiting ${prnType} ${prn.number}`, async () => {
        await openPrn({ page, prnPage }, account, prn)
        await prnPage.expectLoadedForAwaitingPrn(prn)
      })

      await test.step('the link is at the base of the page', async () => {
        await prnPage.expectPdfControlAtBase()
      })

      await test.step('it downloads a PDF named after the number', async () => {
        await expectPdf(await prnPage.downloadPdf(), prn)
      })
    })

    test('accepted: the link is at the base of the page and the PDF says which year it was accepted towards', async ({
      page,
      request,
      prnPage
    }) => {
      skipUnlessPrnsConfigured()

      const prn = (await listAcceptedPrns(request, getOrgId(account))).find(
        (p) => typeOf(p) === prnType
      )
      expectSeededOnLocal(prn, `an accepted ${prnType}`)
      test.skip(!prn, `No accepted ${prnType} on this deployed environment`)

      await test.step(`open accepted ${prnType} ${prn.number}`, async () => {
        await openPrn({ page, prnPage }, account, prn)
        await prnPage.expectLoadedForAcceptedPrn(prn)
      })

      await test.step('the link is at the base of the page', async () => {
        await prnPage.expectPdfControlAtBase()
      })

      await test.step('it downloads a PDF with the accepted year', async () => {
        await expectPdf(await prnPage.downloadPdf(), prn, {
          includes: [
            `Accepted towards ${prn.obligationYear} recycling obligations`
          ]
        })
      })
    })

    test('rejected: the link is in the green banner and downloads <number>.pdf', async ({
      page,
      request,
      prnPage
    }) => {
      skipUnlessPrnsConfigured()

      const prn = (await listRejectedPrns(request, getOrgId(account)))[0]
      test.skip(!prn, `No rejected note for ${label} in this environment`)

      await test.step(`open rejected note ${prn.number}`, async () => {
        await openPrn({ page, prnPage }, account, prn)
        await expect(prnPage.heading).toBeVisible()
      })

      await test.step('the link is within the green banner', async () => {
        await prnPage.expectPdfControlInGreenBanner()
      })

      await test.step('it downloads a PDF named after the number', async () => {
        await expectPdf(await prnPage.downloadPdf(), prn)
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
    page,
    request,
    prnPage
  }) => {
    skipUnlessPrnsConfigured()
    test.skip(
      process.env.JOURNEY_ACCEPT_PRN !== 'true',
      'Accepts a note: set JOURNEY_ACCEPT_PRN=true on LOCAL and reset the seeded notes afterwards'
    )

    const prn = (await listAwaitingPrns(request, getOrgId('dp'))).find(
      (p) => typeOf(p) === 'PRN' && p.decemberWaste === false
    )
    expect(prn, 'A standard awaiting PRN is needed').toBeDefined()

    await test.step(`accept ${prn.number}`, async () => {
      await openPrn({ page, prnPage }, 'dp', prn)
      await page.getByText('Accept this PRN', { exact: true }).click()
      await page.getByRole('button', { name: /yes, accept/i }).click()
      await expect(page).toHaveURL(
        (url) => !url.pathname.includes('confirm-accept')
      )
      await prnPage.dismissCookieBannerIfShown()
    })

    await test.step('the link is within the green confirmation banner', async () => {
      await prnPage.expectPdfControlInGreenBanner()
    })

    await test.step('it downloads a PDF that says it was accepted, without the green box', async () => {
      await expectPdf(await prnPage.downloadPdf(), prn, {
        includes: [
          `Accepted towards ${prn.obligationYear} recycling obligations`
        ]
      })
    })
  })
})
