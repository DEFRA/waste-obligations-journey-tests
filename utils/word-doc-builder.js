import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  PageBreak,
  Packer,
  Paragraph,
  TextRun
} from 'docx'

// A4 minus 1-inch (72pt) margins → 6.5in width. docx expects pixels; screenshots
// come out at browser resolution (1280w default) and docx scales them down to fit.
const PAGE_WIDTH_PX = 620
const MAX_HEIGHT_PX = 800

async function readCaption(pngPath) {
  try {
    const text = await readFile(pngPath.replace(/\.png$/, '.txt'), 'utf8')
    return text.trim()
  } catch {
    return path.basename(pngPath, '.png')
  }
}

async function loadImageParagraphs(screenshotsDir) {
  let entries
  try {
    entries = await readdir(screenshotsDir)
  } catch {
    return []
  }
  const pngs = entries.filter((f) => f.endsWith('.png')).sort()
  const paragraphs = []
  for (let i = 0; i < pngs.length; i += 1) {
    const file = pngs[i]
    const fullPath = path.join(screenshotsDir, file)
    const caption = await readCaption(fullPath)
    const data = await readFile(fullPath)
    paragraphs.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun(`Step ${i + 1}: ${caption}`)]
      })
    )
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data,
            transformation: { width: PAGE_WIDTH_PX, height: MAX_HEIGHT_PX },
            type: 'png'
          })
        ]
      })
    )
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: file, italics: true, size: 16 })]
      })
    )
    if (i < pngs.length - 1) {
      paragraphs.push(new Paragraph({ children: [new PageBreak()] }))
    }
  }
  return paragraphs
}

function coverParagraphs({ journey, regulator, orgType, timestamp, status }) {
  return [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun('CSoC E2E Evidence Pack')]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `${journey} · ${regulator} · ${orgType}`,
          bold: true,
          size: 32
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Run: ${timestamp}`, size: 22 })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Status: ${status}`,
          bold: true,
          color: status === 'PASSED' ? '2E7D32' : 'C62828',
          size: 22
        })
      ]
    }),
    new Paragraph({ children: [new PageBreak()] })
  ]
}

export async function buildEvidenceDoc({
  screenshotsDir,
  outputPath,
  journey,
  regulator,
  orgType,
  timestamp,
  status
}) {
  const cover = coverParagraphs({
    journey,
    regulator,
    orgType,
    timestamp,
    status
  })
  const body = await loadImageParagraphs(screenshotsDir)
  const doc = new Document({
    creator: 'waste-obligations-journey-tests',
    title: `CSoC E2E ${journey} ${regulator} ${orgType}`,
    description: 'Automated CSoC E2E evidence pack',
    sections: [{ children: [...cover, ...body] }]
  })
  const buffer = await Packer.toBuffer(doc)
  await writeFile(outputPath, buffer)
  return outputPath
}
