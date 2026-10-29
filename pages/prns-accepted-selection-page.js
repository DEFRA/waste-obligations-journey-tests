import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'
import { acceptedHeading } from '../utils/bulk-accept.js'

// The confirmation after accepting a selection from the check-selection
// page (MO-471): a panel giving the number accepted and the year, one tile per
// material with its tonnage, a "Search PRNs and PERNs" link and a button to
// the obligations progress.
export class PrnsAcceptedSelectionPage extends BasePage {
  constructor(page) {
    super(page)
    this.tiles = page.getByTestId('accepted-selection-tiles').locator('li')
    this.searchLink = page.getByRole('link', {
      name: 'Search PRNs and PERNs',
      exact: true
    })
  }

  headingFor(count, year) {
    return this.page.getByRole('heading', {
      name: acceptedHeading(count, year),
      exact: true
    })
  }

  async expectLoaded(count, year) {
    await expect(this.headingFor(count, year)).toBeVisible()
  }

  // Each tile's tonnage ("50 tonnes") and description text.
  async readTiles() {
    return this.tiles.evaluateAll((tiles) =>
      tiles.map((tile) => {
        const text = (selector) =>
          tile
            .querySelector(selector)
            ?.textContent?.replace(/\s+/g, ' ')
            .trim() || ''

        return {
          tonnageText: text('.app-accepted-tile__tonnage'),
          description: text('.app-accepted-tile__description')
        }
      })
    )
  }

  // The "Search PRNs and PERNs" link's target, resolved against the page.
  async readSearchLinkUrl() {
    await expect(this.searchLink).toBeVisible()
    return new URL(await this.searchLink.getAttribute('href'), this.page.url())
  }

  // A link styled as a button.
  obligationsProgressButton(year) {
    return this.page.getByRole('button', {
      name: `View your ${year} recycling obligations progress`,
      exact: true
    })
  }

  async openObligationsProgress(year) {
    await this.obligationsProgressButton(year).click()
  }
}
