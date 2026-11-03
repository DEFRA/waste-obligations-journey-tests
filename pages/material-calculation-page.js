import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

// The CDP page that explains how one material's recycling obligation was
// calculated, opened from a material link on the CDP obligations page.
//
// Headings are found by role and level within the main content, and their text
// is asserted with toHaveText, so a failure shows the text expected and the
// text received rather than only that a locator matched nothing.
export class MaterialCalculationPage extends BasePage {
  constructor(page) {
    super(page)
    const main = page.getByRole('main')

    this.heading = main.getByRole('heading', { level: 1 })
    // Present only when the material has reported tonnage to work an example from.
    this.calculationHeading = main.getByRole('heading', { level: 2 })
    // The glass example's sections: total, re-melt and remaining glass.
    this.glassSectionHeadings = main.getByRole('heading', { level: 3 })
    this.main = main
    this.regulationsLink = page.getByRole('link', {
      name: 'Producer Responsibility Obligations (Packaging and Packaging Waste) Regulations 2024'
    })
    this.backLink = page.getByRole('link', {
      name: 'Back to your recycling obligations'
    })
  }

  async expectLoadedFor(year, materialName) {
    await expect(this.heading).toHaveText(
      `Your ${year} recycling obligation for ${materialName}`
    )
    await expect(this.regulationsLink).toHaveAttribute('target', '_blank')
  }

  // The "How we calculated your recycling obligation" section: shown for a
  // material with reported tonnage, absent for one without.
  async expectCalculationShown(shown) {
    await expect(this.calculationHeading).toHaveText(
      shown ? ['How we calculated your recycling obligation'] : []
    )
  }

  async expectGlassBreakdown() {
    await expect(this.main).toContainText(
      'This table shows how your total recycling obligation for glass is divided between glass re-melt and remaining glass.'
    )
    await expect(this.glassSectionHeadings).toHaveText([
      'Total glass obligation',
      'Glass re-melt obligation',
      'Remaining glass obligation'
    ])
  }

  async returnToObligations() {
    await Promise.all([
      this.page.waitForURL(/\/obligations(\?|$)/, {
        waitUntil: 'domcontentloaded'
      }),
      this.backLink.click()
    ])
  }
}
