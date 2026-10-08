// Shared evidence-pack helpers for the CSoC E2E skill. The runner builds the
// pack at the end of a run; render-emails.mjs rebuilds the same pack once the
// notification emails have been captured. Both go through here so the docx
// path and builder arguments can't drift apart.

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')

const RUN_FILE = 'run.json'

export function docxPathFor({ evidenceDir, journey, regulator, orgType, ts }) {
  return path.join(evidenceDir, `${journey}_${regulator}_${orgType}_${ts}.docx`)
}

export async function buildEvidencePack({
  journey,
  regulator,
  orgType,
  ts,
  evidenceDir,
  status
}) {
  const { buildEvidenceDoc } = await import(
    path.join(REPO_ROOT, 'utils', 'word-doc-builder.js')
  )
  const outputPath = docxPathFor({ evidenceDir, journey, regulator, orgType, ts })
  await buildEvidenceDoc({
    screenshotsDir: path.join(evidenceDir, 'screenshots'),
    emailsDir: path.join(evidenceDir, 'emails'),
    outputPath,
    journey,
    regulator,
    orgType,
    timestamp: ts,
    status
  })
  return outputPath
}

export async function writeRunInfo(evidenceDir, info) {
  await writeFile(
    path.join(evidenceDir, RUN_FILE),
    JSON.stringify(info, null, 2) + '\n'
  )
}

export async function readRunInfo(evidenceDir) {
  return JSON.parse(await readFile(path.join(evidenceDir, RUN_FILE), 'utf8'))
}
