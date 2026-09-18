import { test } from '@playwright/test'
import { logJourney } from './journey-log.js'

// Reporting only: the caller decides which steps do not apply to its scenario.
export async function reportSkippedSteps(steps, reason) {
  logJourney(test.info(), `SKIPPED STEPS: ${steps} — ${reason}`)
  await test.step.skip(steps, async () => {})
}
