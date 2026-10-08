'use strict'

const pages = require('../lib/pages')
const {
  signInStep,
  prnIdByNumber,
  DEFAULT_PRNS,
  commitGuard
} = require('./_common')

// Walks the six screens from the "Multi-Year and December Waste – June 2026" topic guide on the real service, so a
// moderator can run the H1–H6 probes against it (or a tester can capture what a participant would see).
// Replies are free-text NOTEs; PASS = "behaved as the hypothesis predicts / no issue", FAIL = "problem observed".
// Run with --dry-run unless the session is meant to accept PRNs.

module.exports = {
  id: 'MYDW-R',
  title: 'Research walkthrough — topic guide screens 1–6',
  preconditionsSummary: () => [
    'Framing: "It\'s December 2026. The deadline for meeting your 2026 recycling obligations is approaching. You\'ve bought several PRNs, including one or two December Waste PRNs…" (use scenario S1 or S2).',
    'Moderator: do not explain the UI; confusion is data. Probe with "tell me more".'
  ],
  buildSteps: async (ctx) => {
    const dw = ctx.prnNumber || DEFAULT_PRNS[ctx.orgType].dw
    const next = ctx.complianceYear + 1
    const state = {}
    return [
      signInStep('00'),
      {
        id: 'S1',
        title: 'Screen 1 — Dashboard tile',
        hypothesis: 'H1',
        observe: 'Do they read the tile or scan and click? Any hesitation?',
        action: async ({ page }) => {
          await pages.home.manageObligationsLink(page).scrollIntoViewIfNeeded()
        },
        expected:
          'Probes: "What does this tile tell you about what you can do here?" — after moving on: "What did you notice on that tile?"'
      },
      {
        id: 'S2',
        title: 'Screen 2 — Year selection',
        hypothesis: 'H2',
        observe: `Do they pause at ${next}? Select it, ignore it, or express uncertainty?`,
        action: async ({ page }) => {
          await pages.home.manageObligationsLink(page).click()
          await pages.chooseYear.heading(page).waitFor()
        },
        expected: `Probes: "What do you make of the year options?" / "Why do you think ${next} is available to you?" / if they pick ${ctx.complianceYear}: "What made you choose ${ctx.complianceYear}?" / "If you wanted to accept a December Waste PRN into next year's obligations, does this screen help?"`
      },
      {
        id: 'S3',
        title: 'Screen 3 — Accept or reject PRNs and PERNs',
        hypothesis: 'H3',
        observe:
          'Do they look for a reject option? Do they only notice the accept call to action?',
        action: async ({ page }) => {
          await pages.chooseYear.radio(page, ctx.complianceYear).check()
          await pages.chooseYear.continue(page).click()
          await pages.obligations.acceptOrRejectLink(page).click()
          await pages.prnList.heading(page).waitFor()
        },
        expected:
          'Probes: "Looking at this screen, what are your options?" / "If you wanted to reject one of these PRNs, what would you do?"'
      },
      {
        id: 'S4',
        title: `Screen 4 — Year confirmation (${dw})`,
        hypothesis: 'H4',
        observe:
          'Do they read all options? Hesitate over what "No, go back" does?',
        action: async ({ page }) => {
          state.id = await prnIdByNumber(page, dw, ctx)
          await page.goto(pages.prn.path(state.id))
          await pages.prn.acceptLink(page).click()
          if (await pages.chooseAcceptanceYear.radios(page).count()) {
            await pages.chooseAcceptanceYear
              .radio(page, next)
              .check()
              .catch(() =>
                pages.chooseAcceptanceYear.radios(page).last().check()
              )
            await pages.chooseAcceptanceYear.continue(page).click()
          }
          await pages.acceptConfirm.question(page).waitFor()
        },
        expected:
          'Probes: "What do you think each of these options does?" / "If you changed your mind at this point, which option would you choose and why?"'
      },
      {
        id: 'S5',
        title: 'Screen 5 — Success',
        hypothesis: 'H5',
        observe:
          'Satisfied or uncertain? Do they try to navigate elsewhere to verify?',
        action: async ({ page, ctx: c }) => {
          if (c.dryRun)
            return `${commitGuard(c)}Show the success state from a previous live run's evidence instead.`
          await pages.acceptConfirm.yes(page).click()
          await pages.accepted.bannerTitle(page).waitFor()
        },
        expected:
          'Probes: "How do you feel about where you\'ve got to? Is the task done?" / "What would you do next?" / if they want to check: "What would you be looking for?"'
      },
      {
        id: 'S6',
        title: 'Screen 6 — Bulk acceptance (select, review)',
        hypothesis: 'H6',
        observe:
          'Do they understand the review screen? Notice the navigation options?',
        action: async ({ page }) => {
          await page.goto(pages.prnList.path)
          const boxes = pages.prnList.checkboxes(page)
          const n = Math.min(2, await boxes.count())
          for (let i = 0; i < n; i++) await boxes.nth(i).check()
          await pages.prnList.acceptSelected(page).click()
          await pages.bulk.reviewHeading(page).waitFor()
        },
        expected:
          'Probes: "If you wanted to remove one PRN at this point, what would you do?" / "What do you think happens if you go back?" Note: "Accept" on this page commits immediately — do not click unless intended.'
      },
      {
        id: 'C1',
        title: 'Close',
        action: async () => {},
        expected:
          'Ask: "Was there anything that surprised you or felt off?" / "A moment where you weren\'t sure what the system had done?" / "If you could change one thing…?" Record each answer as NOTE.'
      }
    ]
  }
}
