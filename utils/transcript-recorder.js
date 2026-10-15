import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Human-readable HTTP transcript capture for evidence packs.
// Companion to screenshot-recorder.js — the word-doc-builder walks both dirs.
// Filenames use the same NNN_slug.txt pattern so ordering falls out naturally.
export class TranscriptRecorder {
  constructor(dir, { startAt = 0 } = {}) {
    this.dir = dir
    this.counter = startAt
  }

  static async create(dir, opts = {}) {
    await mkdir(dir, { recursive: true })
    return new TranscriptRecorder(dir, opts)
  }

  slugify(label) {
    return String(label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
  }

  formatHeaders(headers) {
    if (!headers) return ''
    return Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')
  }

  // Renders an HTTP round-trip as text. `body` is truncated to `bodyLimit`
  // chars — evidence packs open in Word, and pasting a 500 KB HTML page into
  // a docx makes it unusable to scroll.
  async record(
    label,
    {
      request: req,
      response,
      requestBody,
      responseBody,
      notes,
      bodyLimit = 4000
    }
  ) {
    this.counter += 1
    const number = String(this.counter).padStart(3, '0')
    const file = `${number}_${this.slugify(label)}.txt`
    const target = path.join(this.dir, file)

    const chunks = []
    chunks.push(`# ${label}`)
    if (notes) chunks.push('', notes)
    chunks.push('', '── REQUEST ──')
    chunks.push(`${req.method} ${req.url}`)
    const reqHeaders = this.formatHeaders(req.headers)
    if (reqHeaders) chunks.push(reqHeaders)
    if (requestBody) {
      chunks.push('', truncate(requestBody, bodyLimit))
    }
    chunks.push('', '── RESPONSE ──')
    chunks.push(
      `HTTP ${response.status()} ${response.statusText() || ''}`.trim()
    )
    const respHeaders = this.formatHeaders(await safeHeaders(response))
    if (respHeaders) chunks.push(respHeaders)
    if (responseBody !== undefined) {
      chunks.push('', truncate(responseBody, bodyLimit))
    }

    await writeFile(target, chunks.join('\n') + '\n', 'utf8')
    return target
  }
}

async function safeHeaders(response) {
  try {
    return response.headers()
  } catch {
    return {}
  }
}

function truncate(text, limit) {
  const s = String(text)
  return s.length <= limit
    ? s
    : `${s.slice(0, limit)}\n\n[...truncated ${s.length - limit} more characters...]`
}

// Convenience wrapper — mirrors recorderFromEnv in screenshot-recorder.js.
export async function transcriptRecorderFromEnv() {
  const dir = process.env.EVIDENCE_DIR
  if (!dir) {
    return { record: async () => null, counter: 0 }
  }
  return TranscriptRecorder.create(path.join(dir, 'transcripts'))
}
