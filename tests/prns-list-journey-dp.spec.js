import { test, expect } from '../fixtures/pages.fixture.js'
import { requireEnv } from '../utils/env.js'
import { submitB2CCredentials } from '../utils/login.js'
import {
  getJourneyStartPath,
  usesPackagingEntryPoint,
  getProducerPrnsUrl
} from '../utils/journey-entry-point.js'
import { logJourney } from '../utils/journey-log.js'
import { reportSkippedSteps } from '../utils/skipped-steps.js'
import { skipUnlessPrnsEnabled } from '../utils/environment-features.js'
import { getOrgId, listAwaitingPrns } from '../utils/waste-obligations-api.js'

const YEAR = 2026

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Producer PRNs list (DP)', () => {
  test('log in and view the PRNs list for the requested year', async ({
    page,
    request,
    landingPage,
    chooseYearPage,
    obligationsPage,
    prnsListPage
  }) => {
    // ENVIRONMENT identifies the target, independently of the browser entry point.
    // The shared Docker action sets local; deployed targets default to tst.
    const requirePrnData = process.env.ENVIRONMENT === 'local'
    let expectedPrn
    if (requirePrnData) {
      expectedPrn =
        await test.step('read the seeded PRN awaiting acceptance', async () => {
          const prns = await listAwaitingPrns(request, getOrgId('dp'))
          expect(
            prns.length,
            'The local journey fixture must contain a PRN awaiting acceptance.'
          ).toBeGreaterThan(0)
          const prn = prns[0]
          for (const value of [
            prn.number,
            prn.material,
            prn.issuer?.organisationName
          ]) {
            expect(value).toEqual(expect.any(String))
            expect(value.trim()).not.toBe('')
          }
          expect(prn.tonnage).toEqual(expect.any(Number))
          return prn
        })
    }

    const packaging = usesPackagingEntryPoint()
    const prnsUrl = getProducerPrnsUrl(YEAR)
    await test.step('open the entry point and sign in as the producer', async () => {
      await page.goto(
        packaging ? getJourneyStartPath('dp', YEAR) : prnsUrl.toString(),
        { timeout: 60_000 }
      )
      await submitB2CCredentials(
        page,
        requireEnv('EPR_USER_EMAIL'),
        requireEnv('EPR_USER_PASSWORD')
      )
    })

    if (packaging) {
      if (await landingPage.hasObligationsEntry()) {
        await landingPage.expectLoaded()
        if (await landingPage.hasYearSelection()) {
          await test.step('open year selection from Azure account home', async () => {
            await landingPage.goToChooseYear()
            await chooseYearPage.expectLoaded()
          })
          await test.step(`select ${YEAR} and check the obligations page`, async () => {
            await chooseYearPage.selectYear(YEAR)
            await chooseYearPage.clickContinue()
            await obligationsPage.expectLoadedForYear(YEAR)
          })
        } else {
          await reportSkippedSteps(
            'Azure choose a year',
            'account home shows the single-year obligations link on this environment'
          )
          await test.step('open obligations from Azure account home', async () => {
            await landingPage.goToObligations()
            await obligationsPage.expectLoaded()
          })
        }
      } else {
        await reportSkippedSteps(
          'Azure account home and choose a year',
          'Manage recycling obligations is not shown on this environment'
        )
      }
      await test.step(`open the CDP PRNs list for ${YEAR}`, async () => {
        await page.goto(prnsUrl.toString())
      })
    } else {
      await reportSkippedSteps(
        'Azure account home and choose a year',
        'unavailable at the waste-obligations entry point; entered the PRNs page directly for ' +
          YEAR
      )
    }

    await skipUnlessPrnsEnabled(prnsListPage)

    await test.step('check the CDP PRNs page loads', async () => {
      await prnsListPage.expectLoaded()
    })

    if (requirePrnData) {
      await test.step('assert the seeded PRN values in the list', async () => {
        await prnsListPage.expectPrnVisible(expectedPrn)
      })
    } else {
      await test.step('report deployed PRN data (diagnostic only)', async () => {
        try {
          const prns = await prnsListPage.readPrnSummaries()
          if (prns.length === 0) {
            const warning =
              'No PRN rows rendered; deployed PRN data is not guaranteed. Row-value assertions were not performed.'
            logJourney(test.info(), `WARNING: ${warning}`)
            test
              .info()
              .annotations.push({ type: 'warning', description: warning })
          } else {
            logJourney(
              test.info(),
              `PRN data: ${prns.length} rendered row(s); diagnostic only, no fixture comparison.`
            )
            for (const prn of prns) {
              logJourney(
                test.info(),
                `PRN: ${prn.number} | Material: ${prn.material} | Tonnes: ${prn.tonnage}`
              )
            }
          }
        } catch {
          const warning =
            'Could not read rendered PRN data; the page heading loaded, but row values were not verified.'
          logJourney(test.info(), `WARNING: ${warning}`)
          test
            .info()
            .annotations.push({ type: 'warning', description: warning })
        }
      })
    }
  })
})
