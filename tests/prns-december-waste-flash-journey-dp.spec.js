import { test, expect } from '../fixtures/pages.fixture.js'
import { skipUnlessPrnsConfigured } from '../utils/environment-features.js'
import { openAuthenticatedProducerPrnsList } from '../utils/prns-list-navigation.js'
import { getOrgId, listAwaitingPrns } from '../utils/waste-obligations-api.js'
import {
  expectedDecemberWasteFlashText,
  isInDecemberJanuaryFlashWindow
} from '../utils/december-waste-flash.js'
import { logJourney } from '../utils/journey-log.js'

const YEAR = 2026

// MO-479: a blue "Can be accepted towards {yearOne} or {yearTwo}" flash shows
// on awaiting-acceptance December waste PRNs with a choice of two obligation
// years, only in December and January. The frontend renders it server-side,
// so the browser clock can't move it. Instead the Docker stacks set the
// frontend's test-only DECEMBER_WASTE_FLASH_DATE (CI: 15 Dec 2026), and this
// runner is given the same value so both agree on the date. Without it (e.g.
// deployed runs) the journey uses today's date.
//
// Outside December/January it asserts no flash on the list or a PRN page. In
// December/January, locally, it asserts the flash on exactly the PRNs the
// business rules select (worked out from the backend PRN data, which only
// local runs read, as in the main PRNs journey), and fails if none qualify.
const requirePrnData = process.env.ENVIRONMENT === 'local'

function flashDate() {
  const configured = process.env.DECEMBER_WASTE_FLASH_DATE
  if (!configured) {
    return new Date()
  }
  const date = new Date(configured)
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `DECEMBER_WASTE_FLASH_DATE must be an ISO date, got ${JSON.stringify(configured)}`
    )
  }
  return date
}

function warn(message) {
  logJourney(test.info(), `WARNING: ${message}`)
  test.info().annotations.push({ type: 'warning', description: message })
}

test.describe('December waste flash on PRN pages (DP)', () => {
  test('shows the December waste flash on the expected PRNs', async ({
    page,
    request,
    prnsListPage,
    prnPage
  }) => {
    skipUnlessPrnsConfigured()

    const now = flashDate()
    const inWindow = isInDecemberJanuaryFlashWindow(now)
    logJourney(
      test.info(),
      `Date ${now.toISOString()}: ${inWindow ? 'inside' : 'outside'} the December/January flash window`
    )

    let expectedFlash = new Map()
    let awaitingPrns = []
    if (requirePrnData) {
      await test.step('work out from the awaiting PRNs which should flash today', async () => {
        awaitingPrns = await listAwaitingPrns(request, getOrgId('dp'))
        expectedFlash = new Map(
          awaitingPrns.flatMap((prn) => {
            const text = expectedDecemberWasteFlashText(prn, now)
            return text ? [[prn.number, text]] : []
          })
        )
        logJourney(
          test.info(),
          `Expected flash: ${[...expectedFlash.keys()].join(', ') || 'none'}`
        )
      })
    }

    await openAuthenticatedProducerPrnsList({ page, prnsListPage }, YEAR)
    const renderedNumbers = (await prnsListPage.readPrnRows()).map(
      (row) => row.number
    )
    const flashNumbers = renderedNumbers.filter((number) =>
      expectedFlash.has(number)
    )

    if (!inWindow) {
      await test.step('no December waste flash shows outside December/January', async () => {
        await prnsListPage.expectDecemberWasteFlashCount(0)
      })
    } else if (requirePrnData) {
      await test.step('the December waste flash shows on exactly the expected PRNs', async () => {
        // Locally the fixture must supply a qualifying PRN; a run that sees
        // none has not tested the flash, so it fails rather than warns.
        expect(
          flashNumbers,
          'No rendered PRN qualifies for the December waste flash: check the backend fixture and DECEMBER_WASTE_FLASH_DATE.'
        ).not.toHaveLength(0)
        for (const number of flashNumbers) {
          await prnsListPage.expectDecemberWasteFlash(
            number,
            expectedFlash.get(number)
          )
        }
        await prnsListPage.expectDecemberWasteFlashCount(flashNumbers.length)
      })
    } else {
      warn(
        'Inside the December/January window on a deployed run: which PRNs should flash depends on backend data this run does not read, so the list flash was not verified.'
      )
    }

    await test.step('clicking a flashing PRN shows the flash on its individual page', async () => {
      if (inWindow && !requirePrnData) {
        warn(
          'Inside the December/January window on a deployed run: the PRN page flash was not verified.'
        )
        return
      }

      if (!inWindow) {
        if (renderedNumbers.length === 0) {
          warn('No PRN is listed, so no individual PRN page was checked.')
          return
        }
        await prnsListPage.openPrn({ number: renderedNumbers[0] })
        await expect(prnPage.heading).toBeVisible()
        await prnPage.expectNoDecemberWasteFlash()
        return
      }

      for (const number of flashNumbers) {
        await openAuthenticatedProducerPrnsList({ page, prnsListPage }, YEAR)
        await prnsListPage.openPrn({ number })
        await expect(prnPage.heading).toBeVisible()
        await prnPage.expectDecemberWasteFlash(expectedFlash.get(number))
      }
    })
  })
})
