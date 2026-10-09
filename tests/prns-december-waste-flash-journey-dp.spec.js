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
// frontend's test-only FAKE_NOW (CI: 15 Dec 2026), and this runner is given
// the same value so both agree on the date. Without it (e.g. deployed runs)
// the journey uses today's date.
//
// This only asserts the flash's presence, in December/January, on the PRNs
// the business rules select (worked out from the backend PRN data, which
// only local runs read, as in the main PRNs journey).
const requirePrnData = process.env.ENVIRONMENT === 'local'

function flashDate() {
  const configured = process.env.FAKE_NOW
  if (!configured) {
    return new Date()
  }
  const date = new Date(configured)
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `FAKE_NOW must be an ISO date, got ${JSON.stringify(configured)}`
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

    if (inWindow && requirePrnData) {
      await test.step('the December waste flash shows on the expected PRNs', async () => {
        const flashing = renderedNumbers.filter((number) =>
          expectedFlash.has(number)
        )
        for (const number of flashing) {
          await prnsListPage.expectDecemberWasteFlashBesideNumberLink(number)
          await prnsListPage.expectDecemberWasteFlash(
            number,
            expectedFlash.get(number)
          )
        }
        if (flashing.length === 0) {
          warn(
            'No rendered PRN qualifies for the December waste flash today, so the flash itself was not seen.'
          )
        }
      })
    } else if (inWindow) {
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

      const flashNumbers = renderedNumbers.filter((number) =>
        expectedFlash.has(number)
      )
      if (flashNumbers.length === 0) {
        warn(
          'No December waste flash PRN is listed, so no individual PRN page flash was checked.'
        )
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
