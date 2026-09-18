import path from 'node:path'

// Include the project and attempt so interleaved workers and retries are distinct.
export function logJourney(testInfo, message) {
  const scenario = `${testInfo.project.name} | ${path.basename(testInfo.file)}:${testInfo.line} | ${testInfo.titlePath.slice(1).join(' › ')} | attempt ${testInfo.retry + 1}`
  const singleLine = `[journey | ${scenario}] ${message}`
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n')
  process.stdout.write(`${singleLine}\n`)
}
