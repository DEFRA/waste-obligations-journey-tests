import path from 'node:path'

const scenarioIds = new WeakMap()
let sequence = 0

// Worker + local sequence distinguishes concurrent scenarios and retry workers.
function scenarioId(testInfo) {
  if (!scenarioIds.has(testInfo)) {
    scenarioIds.set(testInfo, `W${testInfo.workerIndex + 1}.${++sequence}`)
  }
  return scenarioIds.get(testInfo)
}

export function logJourney(testInfo, message) {
  const singleLine = `[${scenarioId(testInfo)}] ${message}`
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n')
  process.stdout.write(`${singleLine}\n`)
}

export function logJourneyStart(testInfo) {
  process.stdout.write('\n\n')
  logJourney(testInfo, '========== START ==========')
  for (const title of testInfo.titlePath.slice(1)) {
    logJourney(testInfo, title)
  }
  logJourney(
    testInfo,
    `Browser: ${testInfo.project.name} | Attempt: ${testInfo.retry + 1}`
  )
  logJourney(testInfo, `Spec: ${path.basename(testInfo.file)}:${testInfo.line}`)
}
