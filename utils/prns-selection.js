import { test } from '../fixtures/pages.fixture.js'

// The PRNs list keeps the user's ticks in their session until they accept
// them, including notes ticked on other list pages. Journeys share one signed-in
// session per account, so a journey that ticks notes starts by emptying what an
// earlier journey left: "Accept selected" with something selected opens the
// review page, which lists the whole selection and can remove each note;
// with nothing selected it shows the list's "select one or more" error.
// Leaves the browser on the list for `year`, opened again by `openPrnsList`.
export async function clearPrnsSelection(
  { page, prnsListPage, prnsCheckSelectionPage },
  openPrnsList,
  year
) {
  await test.step('start with nothing selected', async () => {
    const submitted = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        /\/prns$/.test(new URL(response.url()).pathname)
    )
    await prnsListPage.clickAcceptSelected()
    const response = await submitted
    await page.waitForLoadState('load')

    if (response.status() >= 300 && response.status() < 400) {
      await prnsCheckSelectionPage.expectLoaded()
      await prnsCheckSelectionPage.removeAll()
    }

    await openPrnsList({ page, prnsListPage }, year)
  })
}
