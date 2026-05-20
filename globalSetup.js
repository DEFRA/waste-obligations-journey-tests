/* eslint-disable no-console */
import { networkInterfaces } from 'node:os'

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
}
