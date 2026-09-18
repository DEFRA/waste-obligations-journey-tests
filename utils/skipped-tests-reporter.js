// Supplement Playwright's terse list output with explicit coverage warnings.
export default class SkippedTestsReporter {
  skipped = 0

  onTestEnd(test, result) {
    if (result.status !== 'skipped') return

    this.skipped += 1
    const scenario = test.titlePath().filter(Boolean).join(' › ')
    const reasons = test.annotations
      .filter(({ type }) => type === 'skip' || type === 'fixme')
      .map(({ description }) => description)
      .filter(Boolean)
    const reason =
      reasons.join('; ') ||
      'No skip reason recorded (check dependencies or earlier failures).'
    const message = `SKIPPED SCENARIO: ${scenario} — Reason: ${reason}`

    const consoleMessage = message
      .replaceAll('\r', '\\r')
      .replaceAll('\n', '\\n')
    process.stdout.write(`\n[journey] WARNING: ${consoleMessage}\n`)
    if (process.env.GITHUB_ACTIONS === 'true') {
      // Escape workflow-command data so test names cannot create new commands.
      const escaped = message
        .replaceAll('%', '%25')
        .replaceAll('\r', '%0D')
        .replaceAll('\n', '%0A')
      process.stdout.write(`::warning::${escaped}\n`)
    }
  }

  onEnd() {
    if (this.skipped > 0) {
      process.stdout.write(
        `\n[journey] WARNING: ${this.skipped} scenario(s) SKIPPED — these scenarios were NOT tested. See reasons above.\n`
      )
    }
  }
}
