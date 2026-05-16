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
 * parsed content into a print-quality A4 PDF with cover branding,
 * clickable links, and a "Ready to try this?" CTA on the final page
 * so a reader who got the PDF forwarded to them via email knows how
 * to find us.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'

// Brand strings — single source of truth for any customer-facing
// copy lives in src/lib/brand.ts. We import the constant rather than
// hardcoding so changing the company name / domain / support email
// flows here automatically.
import { BRAND } from '../src/lib/brand'

// A4 dimensions and layout constants. Calculated once so the page
// math stays consistent across sections.
const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 64
const FOOTER_BASELINE = PAGE_H - 50
const CONTENT_W = PAGE_W - MARGIN * 2

// Brand colors — pulled from src/app/globals.css so the PDF stays in
// sync with the site's design tokens. Hard-coded as hex here because
// pdfkit takes color strings, not CSS variables.
const FG = '#0c0a09'         // near-black, body and headings
const FG_MUTED = '#57534e'   // warm gray, subtitles + footer
const FG_SUBTLE = '#a8a29e'  // softest gray, smallest meta
const BRAND_BLUE = '#2563eb' // primary — links + the closing CTA box
const SURFACE_MUTED = '#f5f5f4' // light fill for the callout + CTA
const BORDER_SUBTLE = '#e7e5e4' // hairline separators

const LOGO_PATH = path.resolve(process.cwd(), 'public/HotelOps.png')
const SIGNUP_URL = `https://www.${BRAND.domain}/signup`
const HOME_URL = `https://www.${BRAND.domain}`
const SUPPORT_EMAIL = BRAND.supportEmail

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
// "_..._" on its own line. Inline list items (lines starting with "- ")
// are collected together with their lead paragraph and rendered as a
// bulleted list under it.
// ---------------------------------------------------------------------------

type Para =
  | { kind: 'text'; text: string }
  | { kind: 'list'; items: string[] }

type Block = {
  heading: string
  isNumbered: boolean
  paragraphs: Para[]
  callout: string | null
}

type ParsedGuide = {
  title: string
  subtitle: string
  intro: Para[]
  sections: Block[]
  outros: Block[]
}

function parseGuide(source: string): ParsedGuide {
  const lines = source.split(/\r?\n/)
  let title = ''
  let subtitle = ''
  const intro: Para[] = []
  const allBlocks: Block[] = []

  let phase: 'preamble' | 'block' = 'preamble'
  let currentBlock: Block | null = null
  let currentParagraph: string[] = []
  let currentList: string[] = []

  const targetParas = (): Para[] =>
    phase === 'preamble' ? intro : currentBlock?.paragraphs ?? []

  const flushList = () => {
    if (currentList.length === 0) return
    targetParas().push({ kind: 'list', items: currentList })
    currentList = []
  }

  const flushParagraph = () => {
    if (currentParagraph.length === 0) return
    flushList()
    targetParas().push({
      kind: 'text',
      text: currentParagraph.join(' ').trim(),
    })
    currentParagraph = []
  }

  const flushBlock = () => {
    if (!currentBlock) return
    flushParagraph()
    flushList()
    allBlocks.push(currentBlock)
    currentBlock = null
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (line.startsWith('# ')) {
      title = line.slice(2).trim()
      continue
    }

    if (
      phase === 'preamble' &&
      /^_[^_].*[^_]_$/.test(line) &&
      !subtitle
    ) {
      subtitle = line.slice(1, -1).trim()
      continue
    }

    if (line.startsWith('## ')) {
      flushParagraph()
      flushList()
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
      flushParagraph()
      flushList()
      if (currentBlock) currentBlock.callout = line.slice(2).trim()
      continue
    }

    if (line.startsWith('- ')) {
      flushParagraph()
      currentList.push(line.slice(2).trim())
      continue
    }

    if (line === '') {
      flushParagraph()
      flushList()
      continue
    }

    currentParagraph.push(line)
  }

  flushParagraph()
  flushList()
  flushBlock()

  const sections = allBlocks.filter((b) => b.isNumbered)
  const outros = allBlocks.filter((b) => !b.isNumbered)

  if (!title) throw new Error('Guide source missing # title.')
  if (sections.length === 0) {
    throw new Error('Guide source has no numbered sections (## 1. ...).')
  }

  return { title, subtitle, intro, sections, outros }
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
    margins: { top: MARGIN, bottom: 80, left: MARGIN, right: MARGIN },
    info: {
      Title: guide.title,
      Author: BRAND.name,
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

  renderCover(doc, guide)
  renderIntro(doc, guide.intro)
  renderSections(doc, guide.sections)
  renderOutros(doc, guide.outros)
  renderClosingCta(doc)
  renderFooters(doc)

  doc.end()
}

// ---------------------------------------------------------------------------
// Cover — logo + wordmark, eyebrow, big title, italic subtitle, hairline.
// Renders into the existing first page (pdfkit auto-creates page 1 at
// document construction).
// ---------------------------------------------------------------------------
function renderCover(doc: PDFKit.PDFDocument, guide: ParsedGuide): void {
  const logoSize = 56

  doc.image(LOGO_PATH, MARGIN, MARGIN, { width: logoSize, height: logoSize })

  // Wordmark text next to logo: "My" muted, "HotelOps" bold-fg.
  // We use absolute y positioning so the wordmark aligns optically
  // with the mark rather than sitting on top of the logo image's
  // baseline.
  const wordmarkY = MARGIN + 18
  const wordmarkX = MARGIN + logoSize + 12
  doc
    .font('Helvetica')
    .fontSize(20)
    .fillColor(FG_MUTED)
    .text('My', wordmarkX, wordmarkY, { continued: true, lineBreak: false })
    .font('Helvetica-Bold')
    .fillColor(FG)
    .text('HotelOps')

  // Tagline under the wordmark, small.
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(FG_MUTED)
    .text(BRAND.productTagline, wordmarkX, wordmarkY + 24, {
      width: CONTENT_W - logoSize - 12,
    })

  // Move cursor below the cover header before drawing the title block.
  doc.y = MARGIN + logoSize + 56

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(BRAND_BLUE)
    .text('A FIELD GUIDE', { characterSpacing: 1.8 })

  doc
    .moveDown(0.6)
    .font('Helvetica-Bold')
    .fontSize(28)
    .fillColor(FG)
    .text(guide.title, { lineGap: 4 })

  if (guide.subtitle) {
    doc
      .moveDown(0.3)
      .font('Helvetica-Oblique')
      .fontSize(15)
      .fillColor(FG_MUTED)
      .text(guide.subtitle, { lineGap: 3 })
  }

  doc.moveDown(1.0)

  doc
    .strokeColor(BORDER_SUBTLE)
    .lineWidth(0.6)
    .moveTo(MARGIN, doc.y)
    .lineTo(PAGE_W - MARGIN, doc.y)
    .stroke()
    .moveDown(1)
}

// ---------------------------------------------------------------------------
// Intro paragraphs (between subtitle and first ## section).
// ---------------------------------------------------------------------------
function renderIntro(doc: PDFKit.PDFDocument, intro: Para[]): void {
  for (const p of intro) {
    renderParagraph(doc, p, { lineGapAfter: 0.7 })
  }
  doc.moveDown(0.5)
}

// ---------------------------------------------------------------------------
// Numbered sections with per-section callout.
// ---------------------------------------------------------------------------
function renderSections(doc: PDFKit.PDFDocument, sections: Block[]): void {
  for (const section of sections) {
    if (doc.y > 680) doc.addPage()
    doc
      .moveDown(0.6)
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(FG)
      .text(section.heading, { lineGap: 2 })
      .moveDown(0.4)

    for (const p of section.paragraphs) {
      if (doc.y > 760) doc.addPage()
      renderParagraph(doc, p, { lineGapAfter: 0.5 })
    }

    if (section.callout) {
      doc.moveDown(0.5)

      const calloutWidth = CONTENT_W - 12
      doc.font('Helvetica-Oblique').fontSize(10.5)
      const calloutHeight = doc.heightOfString(section.callout, {
        width: calloutWidth,
        lineGap: 2,
      })

      if (doc.y + calloutHeight > PAGE_H - 80 - 8) doc.addPage()

      const startY = doc.y

      // Left rule in brand color so the callout reads as "this is the
      // sales beat" without dominating the page.
      doc
        .strokeColor(BRAND_BLUE)
        .lineWidth(2)
        .moveTo(MARGIN, startY)
        .lineTo(MARGIN, startY + calloutHeight)
        .stroke()
        .fillColor(FG_MUTED)
        .text(section.callout, MARGIN + 12, startY, {
          width: calloutWidth,
          lineGap: 2,
        })
        .moveDown(0.8)
    }
  }
}

// ---------------------------------------------------------------------------
// Outro / closing blocks (the unnumbered ## headings).
// ---------------------------------------------------------------------------
function renderOutros(doc: PDFKit.PDFDocument, outros: Block[]): void {
  for (const outro of outros) {
    if (doc.y > 680) doc.addPage()
    doc
      .moveDown(0.6)
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor(FG)
      .text(outro.heading, { lineGap: 2 })
      .moveDown(0.4)
    for (const p of outro.paragraphs) {
      renderParagraph(doc, p, { lineGapAfter: 0.5 })
    }
  }
}

// ---------------------------------------------------------------------------
// Closing CTA box — the single most important block in the PDF for a
// reader who got it forwarded by email. Tells them who we are, gives
// them a one-click trial link, and a support contact. Lives on its
// own page so the page-break never amputates it.
// ---------------------------------------------------------------------------
function renderClosingCta(doc: PDFKit.PDFDocument): void {
  // Reserve enough room for the box (280) + the two lines below it
  // (~60). Only push to a new page if the current one can't fit the
  // whole block — otherwise we strand the previous page near-empty
  // for the sake of CTA visual separation, which is the bug the
  // "extra blank pages at the end" complaint described.
  const requiredHeight = 280 + 60
  if (doc.y + requiredHeight > PAGE_H - 80) {
    doc.addPage()
  } else {
    doc.moveDown(1.2)
  }

  const boxX = MARGIN
  const boxY = doc.y
  const boxW = CONTENT_W
  const boxH = 280

  // Brand-blue header band over a light fill — reads as a real CTA
  // box, not a generic content block.
  doc.save()
  doc
    .rect(boxX, boxY, boxW, boxH)
    .fillColor(SURFACE_MUTED)
    .fill()
  doc
    .rect(boxX, boxY, boxW, 6)
    .fillColor(BRAND_BLUE)
    .fill()
  doc.restore()

  const innerX = boxX + 28
  const innerW = boxW - 56
  let cursorY = boxY + 32

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(BRAND_BLUE)
    .text('READY TO PUT THIS IN YOUR BACK OFFICE?', innerX, cursorY, {
      characterSpacing: 1.6,
      width: innerW,
    })
  cursorY += 28

  doc
    .font('Helvetica-Bold')
    .fontSize(22)
    .fillColor(FG)
    .text(
      `Try ${BRAND.name} free for 7 days.`,
      innerX,
      cursorY,
      { width: innerW, lineGap: 2 },
    )
  cursorY = doc.y + 8

  doc
    .font('Helvetica')
    .fontSize(12)
    .fillColor(FG_MUTED)
    .text(
      `No credit card to start. Full access to every feature in this guide — Work Orders, Arrival Pages, IT Hub, Signage, Events, and the new Social Studio add-on. Your data persists if you convert; exports if you do not.`,
      innerX,
      cursorY,
      { width: innerW, lineGap: 3 },
    )
  cursorY = doc.y + 20

  // The hyperlinked CTA — the bit that survives forwards, screenshots,
  // and printouts. pdfkit's `link` option renders the text and
  // registers a clickable annotation over its bounding box.
  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor(BRAND_BLUE)
    .text(`Start your trial →  ${BRAND.domain}/signup`, innerX, cursorY, {
      width: innerW,
      link: SIGNUP_URL,
      underline: true,
    })
  cursorY = doc.y + 18

  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor(FG_MUTED)
    .text('Questions? Reach the founder directly at ', innerX, cursorY, {
      continued: true,
      width: innerW,
    })
    .fillColor(BRAND_BLUE)
    .text(SUPPORT_EMAIL, {
      link: `mailto:${SUPPORT_EMAIL}`,
      underline: true,
      continued: true,
    })
    .fillColor(FG_MUTED)
    .text('.', { underline: false })

  // Below the box: a small "share this guide" prompt plus the
  // website URL (no physical address — the PDF doesn't need to look
  // like an invoice). Encourages forward-friendliness — the same
  // lead funnel that got this PDF to one operator can get it to the
  // operator down the street.
  const belowY = boxY + boxH + 28
  doc
    .font('Helvetica-Oblique')
    .fontSize(10)
    .fillColor(FG_MUTED)
    .text(
      'Found this useful? Forward it to the GM or owner at the property down the street.',
      MARGIN,
      belowY,
      { width: CONTENT_W, align: 'center' },
    )

  doc.moveDown(0.8)
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(BRAND_BLUE)
    .text(BRAND.domain, MARGIN, doc.y, {
      width: CONTENT_W,
      align: 'center',
      link: HOME_URL,
    })
}

// ---------------------------------------------------------------------------
// Per-paragraph rendering. Paragraphs can be plain text or a list of
// bullet items; both render in the body style.
// ---------------------------------------------------------------------------
function renderParagraph(
  doc: PDFKit.PDFDocument,
  p: Para,
  opts: { lineGapAfter: number },
): void {
  if (p.kind === 'text') {
    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor(FG)
      .text(p.text, { align: 'left', lineGap: 3 })
      .moveDown(opts.lineGapAfter)
    return
  }

  // Bulleted list — pdfkit handles wrapping per item. We render the
  // bullet manually rather than using pdfkit's `list` so we can
  // control spacing between items and survive cross-page splits.
  for (const item of p.items) {
    if (doc.y > 760) doc.addPage()
    const startX = MARGIN
    const bulletX = startX
    const textX = startX + 12
    const textWidth = CONTENT_W - 12

    const bulletY = doc.y + 5
    doc
      .save()
      .fillColor(FG)
      .circle(bulletX + 3, bulletY, 1.8)
      .fill()
      .restore()

    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor(FG)
      .text(item, textX, doc.y, {
        width: textWidth,
        lineGap: 3,
      })
      .moveDown(0.25)
  }
  doc.moveDown(opts.lineGapAfter - 0.25)
}

// ---------------------------------------------------------------------------
// Footer on every page — wordmark + clickable URL + page number.
// pdfkit's bufferedPageRange() lets us iterate every page after all
// content has been laid out, which is the only safe time to draw
// "page X of N" since N is only known once content rendering is done.
// ---------------------------------------------------------------------------
function renderFooters(doc: PDFKit.PDFDocument): void {
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)

    // pdfkit auto-paginates when a .text() call would render past the
    // bottom margin — even with absolute (x, y) coordinates. Since
    // the footer intentionally sits below the bottom margin, drop the
    // margin to zero for the duration of the footer draw so the last
    // page doesn't spawn a trailing blank page. Restore it after so
    // anything else that touches the page (it shouldn't) behaves
    // normally.
    const originalBottom = doc.page.margins.bottom
    doc.page.margins.bottom = 0

    // Hairline separator above the footer so the wordmark feels
    // anchored to the page rather than floating.
    doc
      .strokeColor(BORDER_SUBTLE)
      .lineWidth(0.5)
      .moveTo(MARGIN, FOOTER_BASELINE - 8)
      .lineTo(PAGE_W - MARGIN, FOOTER_BASELINE - 8)
      .stroke()

    // Left: wordmark text only (no image in footer — keeps file size
    // down and avoids re-embedding the logo on every page).
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(FG_MUTED)
      .text('My', MARGIN, FOOTER_BASELINE, {
        continued: true,
        lineBreak: false,
      })
      .font('Helvetica-Bold')
      .fillColor(FG)
      .text('HotelOps', { continued: true, lineBreak: false })
      .font('Helvetica')
      .fillColor(FG_MUTED)
      .text('  ·  A field guide for boutique operators', { lineBreak: false })

    // Center: clickable home URL so a reader on any page can get back
    // to the site with one click.
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(BRAND_BLUE)
      .text(BRAND.domain, MARGIN, FOOTER_BASELINE, {
        width: CONTENT_W,
        align: 'center',
        link: HOME_URL,
        underline: false,
        lineBreak: false,
      })

    // Right: page x of y. Use the same baseline; absolute positioning
    // so it doesn't push content.
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(FG_SUBTLE)
      .text(
        `page ${i - range.start + 1} of ${range.count}`,
        MARGIN,
        FOOTER_BASELINE,
        { width: CONTENT_W, align: 'right', lineBreak: false },
      )

    doc.page.margins.bottom = originalBottom
  }
}

build()
