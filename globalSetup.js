/* eslint-disable no-console */
import { execSync } from 'node:child_process'
import { networkInterfaces } from 'node:os'

const TARGET_HOST =
  process.env.ENVIRONMENT === 'dev'
    ? 'rwd-dev9.azure.defra.cloud'
    : 'rwd-tst1.azure.defra.cloud'

function runProbe(label, command, { timeout = 15_000 } = {}) {
  try {
    const output = execSync(command, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout
    })
    console.log(`[startup] ${label}:\n${output.trim() || '(no output)'}`)
  } catch (err) {
    const detail = err.stderr?.toString().trim() || err.message
    console.log(`[startup] ${label}: failed — ${detail}`)
  }
}

export default async function globalSetup() {
  const local = Object.entries(networkInterfaces())
    .flatMap(([name, addrs]) =>
      (addrs || [])
        .filter((a) => a.family === 'IPv4' && !a.internal)
        .map((a) => `${name}=${a.address}`)
    )
    .join(', ')
  console.log(`[startup] local_ip: ${local || 'none'}`)

  try {
    const res = await fetch('https://api.ipify.org?format=json')
    const { ip } = await res.json()
    console.log(`[startup] public_ip: ${ip}`)
  } catch (err) {
    console.log(`[startup] public_ip: unavailable (${err.message})`)
  }

  runProbe('proxy_env', 'env | grep -i proxy || true')
  runProbe(
    'ipify_curl',
    'curl -sS -v --max-time 10 https://api.ipify.org 2>&1 | tail -n 40'
  )
  runProbe(
    `target_curl (${TARGET_HOST})`,
    `curl -sS -vk --max-time 10 https://${TARGET_HOST}/report-data 2>&1 | tail -n 40`
  )
  runProbe(`dns (${TARGET_HOST})`, `nslookup ${TARGET_HOST}`)
  runProbe('nc (4.158.59.150:443)', 'nc -vz 4.158.59.150 443 2>&1', {
    timeout: 90_000
  })
}
