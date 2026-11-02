import { expect } from '@playwright/test'
import { BasePage } from './base-page.js'

// The CDP page that explains how one material's recycling obligation was
// calculated, opened from a material link on the CDP obligations page.
export class MaterialCalculationPage extends BasePage {
  constructor(page) {
    super(page)
    this.calculationHeading = page.getByRole('heading', {
      name: 'How we calculated your recycling obligation',
      level: 2
    })
    this.regulationsLink = page.getByRole('link', {
      name: 'Producer Responsibility Obligations (Packaging and Packaging Waste) Regulations 2024'
    })
    this.backLink = page.getByRole('link', {
      name: 'Back to your recycling obligations'
    })
    this.glassIntroduction = page.getByText(
      'This table shows how your total recycling obligation for glass is divided between glass re-melt and remaining glass.'
    )
  }

  headingFor(year, materialName) {
    return this.page.getByRole('heading', {
      name: `Your ${year} recycling obligation for ${materialName}`,
      level: 1
    })
  }

  async expectLoadedFor(year, materialName) {
    await expect(this.headingFor(year, materialName)).toBeVisible()
    await expect(this.regulationsLink).toHaveAttribute('target', '_blank')
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
