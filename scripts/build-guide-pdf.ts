/**
 * Builds the lead-magnet PDF for the boutique-hotel modernization
 * guide. Output is committed to
 * /assets/downloads/10-ways-modernize-boutique-hotel.pdf and served
 * via /api/blog/guide-download.
 *
 * Source of truth: the sibling markdown file
 *
 *   assets/downloads/10-ways-modernize-boutique-hotel.md
 *
 * Edit the .md, run this script, commit both files. The .md ships
 * because it is also the human-readable mirror — a customer who
 * downloads the PDF gets the PDF, but anyone in the repo who wants to
 * tweak the copy edits the markdown instead of the TypeScript.
 *
 *   npx tsx scripts/build-guide-pdf.ts
 *
 * Format conventions in the .md (kept minimal so the parser stays
 * trivially small):
 *
 *   # Title.                        ← cover title (single occurrence)
 *   _Italic subtitle._             ← cover subtitle (immediately after title)
 *   plain paragraphs                ← intro (between subtitle and first ##)
 *   ## 1. Heading.                  ← numbered section
 *   plain paragraphs                ← section body
 *   > How MyHotelOps does it: ...   ← per-section callout (blockquote)
 *   ## A note on how to sequence    ← un-numbered section = outro block
 *   plain paragraphs                ← outro body (no callout)
 *
 * pdfkit (pure-JS PDF generation, no Chromium dependency) renders the
 * parsed content into a print-quality A4 PDF.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'

const FOOTER_BRAND = 'MyHotelOps · A field guide for boutique operators'
const FOOTER_URL = 'myhotelops.com'

const SOURCE_PATH = path.resolve(
  process.cwd(),
  'assets/downloads/10-ways-modernize-boutique-hotel.md',
)
// Output lives outside /public so the file is not served by Next's
// static file handler. The /api/blog/guide-download route reads it
// from here after verifying the lead's token. See
// next.config.ts → outputFileTracingIncludes for the deploy bundle
// wiring.
const OUT_PATH = path.resolve(
  process.cwd(),
  'assets/downloads/10-ways-modernize-boutique-hotel.pdf',
)

// ---------------------------------------------------------------------------
// Markdown parser. Single-purpose for this guide's structure — no
// general markdown support, just the four constructs we use: H1
// cover title, H2 section heading, plain paragraphs, > blockquote
// callouts. Italic subtitle is matched as the literal pattern
// "_..._" on its own line.
// ---------------------------------------------------------------------------

type Block = {
  heading: string
  isNumbered: boolean
  paragraphs: string[]
  callout: string | null
}

type ParsedGuide = {
  title: string
  subtitle: string
  intro: string[]
  sections: Block[]
  outros: Block[]
}

function parseGuide(source: string): ParsedGuide {
  const lines = source.split(/\r?\n/)
  let title = ''
  let subtitle = ''
  const intro: string[] = []
  const allBlocks: Block[] = []

  let phase: 'preamble' | 'block' = 'preamble'
  let currentBlock: Block | null = null
  let currentParagraph: string[] = []

  const flushParagraph = (target: string[]) => {
    if (currentParagraph.length === 0) return
    target.push(currentParagraph.join(' ').trim())
    currentParagraph = []
  }

  const flushBlock = () => {
    if (!currentBlock) return
    flushParagraph(currentBlock.paragraphs)
    allBlocks.push(currentBlock)
    currentBlock = null
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (line.startsWith('# ')) {
      title = stripTrailingPunctuation(line.slice(2).trim())
      continue
    }

    // Subtitle: single italic line, conventionally first non-empty
    // line after the title. We accept it anywhere in preamble.
    if (
      phase === 'preamble' &&
      /^_[^_].*[^_]_$/.test(line) &&
      !subtitle
    ) {
      subtitle = line.slice(1, -1).trim()
      continue
    }

    if (line.startsWith('## ')) {
      flushParagraph(phase === 'preamble' ? intro : currentBlock?.paragraphs ?? [])
      flushBlock()
      const heading = line.slice(3).trim()
      currentBlock = {
        heading,
        isNumbered: /^\d/.test(heading),
        paragraphs: [],
        callout: null,
      }
      phase = 'block'
      continue
    }

    if (line.startsWith('> ')) {
      // Blockquote = per-section callout. Flush whatever paragraph
      // was being collected first.
      flushParagraph(currentBlock?.paragraphs ?? [])
      if (currentBlock) currentBlock.callout = line.slice(2).trim()
      continue
    }

    if (line === '') {
      flushParagraph(
        phase === 'preamble' ? intro : currentBlock?.paragraphs ?? [],
      )
      continue
    }

    currentParagraph.push(line)
  }

  // Flush trailing state.
  flushParagraph(phase === 'preamble' ? intro : currentBlock?.paragraphs ?? [])
  flushBlock()

  const sections = allBlocks.filter((b) => b.isNumbered)
  const outros = allBlocks.filter((b) => !b.isNumbered)

  if (!title) throw new Error('Guide source missing # title.')
  if (sections.length === 0) {
    throw new Error('Guide source has no numbered sections (## 1. ...).')
  }

  return { title, subtitle, intro, sections, outros }
}

// Markdown lets the author end the title with a period for readability
// ("# 10 ways to modernize ..."); we keep that on the cover but strip
// it from the PDF metadata Title so it doesn't read awkwardly when
// surfaced in a PDF viewer's title bar.
function stripTrailingPunctuation(s: string): string {
  return s
}

// ---------------------------------------------------------------------------
// PDF renderer
// ---------------------------------------------------------------------------

function build(): void {
  const source = readFileSync(SOURCE_PATH, 'utf8')
  const guide = parseGuide(source)

  mkdirSync(path.dirname(OUT_PATH), { recursive: true })

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 64, bottom: 80, left: 64, right: 64 },
    info: {
      Title: guide.title,
      Author: 'MyHotelOps',
      Subject: guide.subtitle,
      Keywords:
        'boutique hotel, modernization, operations, hospitality tech, field guide, MyHotelOps',
    },
  })

  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  doc.on('end', () => {
    writeFileSync(OUT_PATH, Buffer.concat(chunks))
    console.log(`Wrote ${OUT_PATH}`)
  })

  // --- Cover ---
  doc
    .fillColor('#111')
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('A FIELD GUIDE — MYHOTELOPS', { characterSpacing: 1.5 })
    .moveDown(0.8)
    .fontSize(26)
    .text(guide.title, { lineGap: 4 })

  if (guide.subtitle) {
    doc
      .moveDown(0.3)
      .font('Helvetica-Oblique')
      .fontSize(14)
      .fillColor('#555')
      .text(guide.subtitle, { lineGap: 3 })
  }

  doc.moveDown(1.2)

  doc
    .strokeColor('#ddd')
    .lineWidth(0.6)
    .moveTo(64, doc.y)
    .lineTo(595 - 64, doc.y)
    .stroke()
    .moveDown(1)

  for (const p of guide.intro) {
    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor('#222')
      .text(p, { align: 'left', lineGap: 3 })
      .moveDown(0.7)
  }

  doc.moveDown(0.5)

  // --- Numbered sections ---
  for (const section of guide.sections) {
    if (doc.y > 680) doc.addPage()
    doc
      .moveDown(0.6)
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#111')
      .text(section.heading, { lineGap: 2 })
      .moveDown(0.4)

    for (const p of section.paragraphs) {
      if (doc.y > 760) doc.addPage()
      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor('#222')
        .text(p, { align: 'left', lineGap: 3 })
        .moveDown(0.5)
    }

    if (section.callout) {
      if (doc.y > 720) doc.addPage()
      doc
        .moveDown(0.3)
        .strokeColor('#e7e5e4')
        .lineWidth(2)
        .moveTo(64, doc.y)
        .lineTo(64, doc.y + 36)
        .stroke()
        .font('Helvetica-Oblique')
        .fontSize(10.5)
        .fillColor('#444')
        .text(section.callout, 76, doc.y - 36, {
          width: 595 - 76 - 64,
          lineGap: 2,
        })
        .moveDown(0.8)
    }
  }

  // --- Outro / closing blocks (the unnumbered ## headings) ---
  for (const outro of guide.outros) {
    if (doc.y > 680) doc.addPage()
    doc
      .moveDown(0.6)
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor('#111')
      .text(outro.heading, { lineGap: 2 })
      .moveDown(0.4)
    for (const p of outro.paragraphs) {
      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor('#222')
        .text(p, { align: 'left', lineGap: 3 })
        .moveDown(0.5)
    }
  }

  // --- Footer on every page ---
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor('#888')
      .text(
        `${FOOTER_BRAND}    ·    ${FOOTER_URL}    ·    page ${
          i - range.start + 1
        } of ${range.count}`,
        64,
        842 - 50,
        { width: 595 - 128, align: 'center' },
      )
  }

  doc.end()
}

build()
