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

  console.log('HTTP_PROXY=', process.env.HTTP_PROXY)
  console.log('HTTPS_PROXY=', process.env.HTTPS_PROXY)
  console.log('CDP_HTTPS_PROXY=', process.env.CDP_HTTPS_PROXY)
  console.log('NO_PROXY=', process.env.NO_PROXY)

  try {
    const res = await fetch('https://api.ipify.org?format=json')
    const { ip } = await res.json()
    console.log(`[startup] public_ip: ${ip}`)
  } catch (err) {
    console.log(`[startup] public_ip: unavailable (${err.message})`)
  }

  const proxy = process.env.HTTP_PROXY || process.env.CDP_HTTPS_PROXY || ''
  const proxyFlag = proxy ? `--proxy "${proxy}"` : ''

  runProbe('proxy_env', 'env | grep -i proxy || true')
  runProbe(
    'ipify_curl',
    `curl -sS -v ${proxyFlag} --max-time 10 https://api.ipify.org 2>&1 | tail -n 40`
  )
  runProbe(
    `target_curl (${TARGET_HOST})`,
    `curl -sS -vk ${proxyFlag} --max-time 10 https://${TARGET_HOST}/report-data 2>&1 | tail -n 40`
  )
  runProbe(`dns (${TARGET_HOST})`, `nslookup ${TARGET_HOST}`)
  runProbe(
    'nc (via proxy → 4.158.59.150:443)',
    'nc -x 127.0.0.1:3128 -X connect -vz 4.158.59.150 443 2>&1',
    { timeout: 30_000 }
  )
}
