import { test } from 'node:test'
import assert from 'node:assert/strict'
import SkippedTestsReporter from '../utils/skipped-tests-reporter.js'

test('skipped scenarios report reasons and escaped GitHub warnings without changing outcomes', () => {
  const originalWrite = process.stdout.write
  const originalGithubActions = process.env.GITHUB_ACTIONS
  let output = ''
  process.env.GITHUB_ACTIONS = 'true'
  process.stdout.write = (chunk) => {
    output += chunk
    return true
  }
  try {
    const reporter = new SkippedTestsReporter()
    const scenario = {
      titlePath: () => ['', 'chrome-android', 'scenario 100%\n::error::text'],
      annotations: [{ type: 'skip', description: 'Azure-only step' }]
    }
    reporter.onTestEnd(scenario, { status: 'passed' })
    reporter.onTestEnd(scenario, { status: 'failed' })
    assert.equal(output, '')
    reporter.onTestEnd(scenario, { status: 'skipped' })
    reporter.onTestEnd({ ...scenario, annotations: [] }, { status: 'skipped' })
    reporter.onEnd()
    assert.match(output, /SKIPPED SCENARIO: chrome-android/)
    assert.match(output, /Reason: Azure-only step/)
    assert.match(output, /No skip reason recorded/)
    assert.match(output, /::warning::.*100%25%0A::error::text/)
    assert.doesNotMatch(output, /^::error::/m)
    assert.match(output, /2 scenario\(s\) SKIPPED/)
  } finally {
    process.stdout.write = originalWrite
    if (originalGithubActions === undefined) delete process.env.GITHUB_ACTIONS
    else process.env.GITHUB_ACTIONS = originalGithubActions
  }
})
