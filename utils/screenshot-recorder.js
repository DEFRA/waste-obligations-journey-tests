import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Numbered full-page screenshot capture into a shared evidence directory.
// Both the producer spec (this repo) and the regulator spec (sibling repo)
// point at the same $EVIDENCE_DIR/screenshots dir and share the counter via
// on-disk NNN prefixes, so the file listing is naturally ordered when the
// word-doc builder walks it.
export class ScreenshotRecorder {
  constructor(dir, { startAt = 0, side = 'producer' } = {}) {
    this.dir = dir
    this.side = side
    this.counter = startAt
  }

  static async create(dir, opts = {}) {
    await mkdir(dir, { recursive: true })
    return new ScreenshotRecorder(dir, opts)
  }

  slugify(label) {
    return String(label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
  }

  async capture(page, label) {
    this.counter += 1
    const number = String(this.counter).padStart(3, '0')
    const file = `${number}_${this.side}_${this.slugify(label)}.png`
    const target = path.join(this.dir, file)
    const buffer = await page.screenshot({ fullPage: true })
    await writeFile(target, buffer)
    // Sidecar caption file — the word-doc builder uses `label` verbatim as the
    // human-facing caption rather than reverse-engineering it from the filename.
    await writeFile(target.replace(/\.png$/, '.txt'), `${label}\n`, 'utf8')
    return target
  }
}

// Convenience wrapper for specs that don't want to hold the recorder themselves:
// when EVIDENCE_DIR is set, returns a real recorder; otherwise a no-op stub.
export async function recorderFromEnv(side = 'producer') {
  const dir = process.env.EVIDENCE_DIR
  if (!dir) {
    return { capture: async () => null, counter: 0 }
  }
  const startAt = Number(process.env.SCREENSHOT_START_AT || 0)
  return ScreenshotRecorder.create(path.join(dir, 'screenshots'), {
    startAt,
    side
  })
}
