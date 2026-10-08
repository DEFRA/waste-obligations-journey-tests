'use strict'

const readline = require('readline')

function frame(step) {
  const parts = [
    `<<STEP id=${step.id} title=${JSON.stringify(step.title)} journey=${step.journey}>>`,
    step.expected,
    '<<AWAIT>>'
  ]
  process.stdout.write(parts.join('\n') + '\n')
}

// MYDW_AUTO_REPLY=PASS answers every step without stdin (unattended smoke runs; verdicts are then meaningless).
function makeReader() {
  if (process.env.MYDW_AUTO_REPLY) {
    return { next: async () => process.env.MYDW_AUTO_REPLY, close() {} }
  }
  const rl = readline.createInterface({ input: process.stdin })
  const queue = []
  const waiters = []

  rl.on('line', (line) => {
    if (waiters.length) waiters.shift()(line)
    else {
      queue.push(line)
      if (queue.length > 50) rl.pause()
    }
  })

  rl.on('close', () => {
    while (waiters.length) waiters.shift()(null)
  })

  return {
    next() {
      return new Promise((resolve) => {
        if (queue.length) {
          resolve(queue.shift())
          if (queue.length <= 50) rl.resume()
        } else waiters.push(resolve)
      })
    },
    close() {
      rl.close()
    }
  }
}

function parseReply(raw) {
  if (raw === null || raw === undefined)
    return { verdict: 'FAIL', note: 'no reply (stdin closed)' }
  const trimmed = String(raw).trim()
  if (!trimmed) return { verdict: 'PASS', note: '' }
  const upper = trimmed.toUpperCase()
  if (upper === 'PASS') return { verdict: 'PASS', note: '' }
  if (upper === 'SKIP') return { verdict: 'SKIP', note: '' }
  if (upper.startsWith('FAIL')) {
    return { verdict: 'FAIL', note: trimmed.slice(4).replace(/^[:\s-]+/, '') }
  }
  if (upper.startsWith('NOTE')) {
    return { verdict: 'PASS', note: trimmed.slice(4).replace(/^[:\s-]+/, '') }
  }
  return { verdict: 'PASS', note: trimmed }
}

function info(msg) {
  process.stdout.write(msg + '\n')
}

module.exports = { frame, makeReader, parseReply, info }
