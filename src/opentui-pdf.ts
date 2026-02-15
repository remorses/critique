// Generic opentui CapturedFrame to PDF conversion using pdfkit.
// No critique-specific dependencies - can be reused for any opentui app.
//
// Architecture mirrors opentui-image.ts:
//   CapturedFrame → spans → lines → pages → PDF buffer
//
// Uses exact coordinate positioning for monospace grid layout.
// Each character occupies a fixed width (fontSize * charWidthRatio).
// Background colors are rendered as filled rectangles behind text spans.
//
// Page splitting: smart breaking at natural section boundaries
// (empty line sequences). Falls back to fixed-size pages when
// no good break exists within the last 50% of a page.

import { TextAttributes, rgbToHex, type RGBA } from "@opentuah/core"
import type { CapturedFrame, CapturedLine, CapturedSpan } from "@opentuah/core"
import fs from "fs"

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/** Theme colors needed for PDF rendering */
export interface PdfTheme {
  /** Background color as hex string */
  background: string
  /** Text color as hex string */
  text: string
}

/** Options for rendering a PDF */
export interface RenderPdfOptions {
  /** Page width in points (default: 595 = A4 portrait) */
  pageWidth?: number
  /** Page height in points (default: 842 = A4 portrait) */
  pageHeight?: number
  /** Font size in points (default: 10) */
  fontSize?: number
  /** Line height multiplier (default: 1.4) */
  lineHeight?: number
  /** Horizontal padding in points (default: 24) */
  paddingX?: number
  /** Vertical padding in points (default: 20) */
  paddingY?: number
  /** Theme colors */
  theme: PdfTheme
  /**
   * Path to monospace font file (.ttf, .otf, .woff2).
   * If not set, uses built-in Courier.
   */
  fontPath?: string
  /**
   * Path to bold variant of the monospace font.
   * If not set, bold text uses the regular font with synthetic bold.
   */
  fontBoldPath?: string
  /**
   * Path to italic variant of the monospace font.
   * If not set, italic text uses the regular font.
   */
  fontItalicPath?: string
  /**
   * Char width ratio relative to fontSize for monospace fonts.
   * Most monospace fonts have ratio ~0.6.
   * Default: 0.6
   */
  charWidthRatio?: number
}

/** Result from PDF render */
export interface PdfRenderResult {
  /** PDF as Buffer */
  buffer: Buffer
  /** Total number of content lines */
  totalLines: number
  /** Number of pages generated */
  pageCount: number
}

/** Layout calculation for a PDF page */
export interface PdfPageLayout {
  /** Lines per page */
  linesPerPage: number
  /** Number of pages needed */
  pageCount: number
  /** Content width in points (page minus padding) */
  contentWidth: number
  /** Char width in points */
  charWidth: number
  /** Line height in points */
  lineHeightPt: number
  /** Total lines after trimming */
  totalLines: number
}

// ─────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────

/**
 * Convert RGBA to hex string, returning null for transparent colors.
 */
function rgbaToHexOrNull(rgba: RGBA): string | null {
  if (rgba.a === 0) return null
  return rgbToHex(rgba)
}

/**
 * Check if a line is empty (no spans or only whitespace).
 */
function isLineEmpty(line: CapturedLine): boolean {
  if (line.spans.length === 0) return true
  return line.spans.every((span) => span.text.trim() === "")
}

/**
 * Trim empty lines from end of lines array.
 */
function trimTrailingEmptyLines(lines: CapturedLine[]): CapturedLine[] {
  let result = [...lines]
  while (result.length > 0 && isLineEmpty(result[result.length - 1]!)) {
    result = result.slice(0, -1)
  }
  return result
}

// ─────────────────────────────────────────────────────────────
// Font Loading
// ─────────────────────────────────────────────────────────────

/**
 * Load a font file as a Buffer, decompressing woff2 if needed.
 * PDFKit's fontkit has issues with woff2 files directly,
 * so we decompress them to raw TTF using wawoff2.
 */
async function loadFontBuffer(fontPath: string): Promise<Buffer> {
  const raw = fs.readFileSync(fontPath)
  if (fontPath.endsWith(".woff2")) {
    const wawoff2 = await import("wawoff2")
    const decompressed = await wawoff2.decompress(raw)
    return Buffer.from(decompressed)
  }
  return raw
}

// ─────────────────────────────────────────────────────────────
// Layout Calculation
// ─────────────────────────────────────────────────────────────

/**
 * Calculate layout metrics for PDF rendering.
 * Determines pagination, content area, char sizing.
 */
export function calculatePdfLayout(
  totalLines: number,
  options: RenderPdfOptions
): PdfPageLayout {
  const {
    pageWidth = 595,
    pageHeight = 842,
    fontSize = 10,
    lineHeight = 1.4,
    paddingX = 24,
    paddingY = 20,
    charWidthRatio = 0.6,
  } = options

  const lineHeightPt = Math.round(fontSize * lineHeight)
  const contentWidth = pageWidth - paddingX * 2
  const charWidth = fontSize * charWidthRatio
  const availableHeight = pageHeight - paddingY * 2
  // Guard: ensure at least 1 line per page to prevent infinite loop
  // when page is too small for even a single line
  const linesPerPage = Math.max(1, Math.floor(availableHeight / lineHeightPt))
  const pageCount = Math.max(1, Math.ceil(totalLines / linesPerPage))

  return {
    linesPerPage,
    pageCount,
    contentWidth,
    charWidth,
    lineHeightPt,
    totalLines,
  }
}

// ─────────────────────────────────────────────────────────────
// Smart Page Breaking
// ─────────────────────────────────────────────────────────────

/**
 * Find all line indices that are good page break candidates.
 * A "break point" means "break BEFORE this line" (this line starts the next page).
 *
 * Only detects 2+ consecutive empty lines as break points.
 * These correspond to major section/group separators in opentui output
 * (e.g. marginBottom: 2 between review groups). Single empty lines
 * within paragraphs or code blocks are ignored.
 *
 * Returns a Set of line indices where breaking is appropriate.
 */
export function findBreakPoints(lines: CapturedLine[]): Set<number> {
  const breakPoints = new Set<number>()

  for (let i = 2; i < lines.length; i++) {
    // Break at the first non-empty line after 2+ consecutive empty lines.
    // This targets section boundaries (opentui gap/margin), not minor spacing.
    if (
      !isLineEmpty(lines[i]!) &&
      isLineEmpty(lines[i - 1]!) &&
      isLineEmpty(lines[i - 2]!)
    ) {
      breakPoints.add(i)
    }
  }

  return breakPoints
}

/**
 * Compute page start indices using smart breaking.
 *
 * Algorithm: for each page, scan from the page start up to
 * linesPerPage lines. Find the LAST break point in that range.
 * If the last break point is closer than 50% of linesPerPage
 * from the page start (would waste >50% of the page), ignore it
 * and force-break at linesPerPage instead.
 *
 * Returns array of line indices where each page starts: [0, start1, start2, ...]
 */
export function computePageBreaks(
  totalLines: number,
  linesPerPage: number,
  breakPoints: Set<number>
): number[] {
  const pageStarts: number[] = [0]
  let cursor = 0

  while (cursor < totalLines) {
    const maxEnd = cursor + linesPerPage
    // If remaining content fits on this page, done
    if (maxEnd >= totalLines) break

    // Look for the last break point between cursor and maxEnd (exclusive)
    // that is at least 50% into the page
    const minBreak = cursor + Math.floor(linesPerPage * 0.5)
    let bestBreak = -1

    for (let i = maxEnd; i >= minBreak; i--) {
      if (breakPoints.has(i)) {
        bestBreak = i
        break
      }
    }

    if (bestBreak > cursor) {
      // Use the smart break
      pageStarts.push(bestBreak)
      cursor = bestBreak
    } else {
      // No good break found, force-break at max capacity
      pageStarts.push(maxEnd)
      cursor = maxEnd
    }
  }

  return pageStarts
}

// ─────────────────────────────────────────────────────────────
// Span-level Rendering
// ─────────────────────────────────────────────────────────────

/**
 * Render a single CapturedSpan to the PDF document at a given position.
 * Handles: color, backgroundColor (rect behind text), bold, italic, dim.
 * Returns the new x position after the span.
 */
export function renderSpanToPdf(
  doc: PDFKit.PDFDocument,
  span: CapturedSpan,
  x: number,
  y: number,
  options: {
    fontSize: number
    charWidth: number
    lineHeightPt: number
    defaultColor: string
    backgroundColor: string
    hasBoldFont: boolean
    hasItalicFont: boolean
  }
): number {
  const { fontSize, charWidth, lineHeightPt, defaultColor, backgroundColor } = options

  if (span.text.length === 0) return x

  // Use span.width (terminal cell width) for positioning, not text.length.
  // This correctly handles CJK/emoji/wide characters that occupy 2 cells.
  const cellWidth = span.width > 0 ? span.width : span.text.length
  const spanWidth = cellWidth * charWidth
  const fg = rgbaToHexOrNull(span.fg)
  const bg = rgbaToHexOrNull(span.bg)

  // Draw background rectangle if span has a bg color different from page bg
  if (bg && bg !== backgroundColor) {
    doc.save()
    doc.fillColor(bg)
    doc.rect(x, y, spanWidth, lineHeightPt).fill()
    doc.restore()
  }

  // Handle dim (opacity)
  const isDim = (span.attributes & TextAttributes.DIM) !== 0
  if (isDim) {
    doc.fillOpacity(0.5)
  }

  // Handle bold/italic font switching
  const isBold = (span.attributes & TextAttributes.BOLD) !== 0
  const isItalic = (span.attributes & TextAttributes.ITALIC) !== 0

  if (isBold && options.hasBoldFont) {
    doc.font("mono-bold")
  } else if (isItalic && options.hasItalicFont) {
    doc.font("mono-italic")
  } else {
    doc.font("mono")
  }

  // Set text color
  doc.fillColor(fg || defaultColor)

  // Render text at exact position
  // lineBreak: false prevents pdfkit from wrapping
  // Vertical centering: offset y by (lineHeight - fontSize) / 2
  const textY = y + (lineHeightPt - fontSize) / 2
  doc.fontSize(fontSize)
  doc.text(span.text, x, textY, {
    lineBreak: false,
    width: spanWidth + charWidth, // slight extra to prevent clipping
  })

  // Draw underline
  const isUnderline = (span.attributes & TextAttributes.UNDERLINE) !== 0
  if (isUnderline) {
    const underlineY = y + lineHeightPt - (lineHeightPt - fontSize) / 4
    doc.save()
    doc.strokeColor(fg || defaultColor)
    doc.lineWidth(Math.max(0.5, fontSize / 14))
    doc.moveTo(x, underlineY).lineTo(x + spanWidth, underlineY).stroke()
    doc.restore()
  }

  // Draw strikethrough
  const isStrikethrough = (span.attributes & TextAttributes.STRIKETHROUGH) !== 0
  if (isStrikethrough) {
    const strikeY = y + lineHeightPt / 2
    doc.save()
    doc.strokeColor(fg || defaultColor)
    doc.lineWidth(Math.max(0.5, fontSize / 14))
    doc.moveTo(x, strikeY).lineTo(x + spanWidth, strikeY).stroke()
    doc.restore()
  }

  // Reset opacity
  if (isDim) {
    doc.fillOpacity(1)
  }

  return x + spanWidth
}

// ─────────────────────────────────────────────────────────────
// Line-level Rendering
// ─────────────────────────────────────────────────────────────

/**
 * Render a single CapturedLine to the PDF document.
 * Fills line background, then renders each span left-to-right.
 */
export function renderLineToPdf(
  doc: PDFKit.PDFDocument,
  line: CapturedLine,
  y: number,
  options: {
    paddingX: number
    contentWidth: number
    pageWidth: number
    fontSize: number
    charWidth: number
    lineHeightPt: number
    theme: PdfTheme
    hasBoldFont: boolean
    hasItalicFont: boolean
  }
): void {
  const {
    paddingX,
    pageWidth,
    fontSize,
    charWidth,
    lineHeightPt,
    theme,
  } = options

  // Determine line background from last span (same logic as opentui-image.ts)
  const lastSpan = line.spans[line.spans.length - 1]
  const lineBackground = lastSpan
    ? (rgbaToHexOrNull(lastSpan.bg) || theme.background)
    : theme.background

  // Fill entire line width with background
  if (lineBackground !== theme.background) {
    doc.save()
    doc.fillColor(lineBackground)
    doc.rect(0, y, pageWidth, lineHeightPt).fill()
    doc.restore()
  }

  // Render each span
  let x = paddingX
  for (const span of line.spans) {
    x = renderSpanToPdf(doc, span, x, y, {
      fontSize,
      charWidth,
      lineHeightPt,
      defaultColor: theme.text,
      backgroundColor: theme.background,
      hasBoldFont: options.hasBoldFont,
      hasItalicFont: options.hasItalicFont,
    })
  }
}

// ─────────────────────────────────────────────────────────────
// Document-level Rendering
// ─────────────────────────────────────────────────────────────

/**
 * Render entire CapturedFrame to a PDF buffer.
 * Auto-paginates when content exceeds page height.
 * This is the main entry point - generic for any opentui output.
 *
 * Smart page breaking: detects natural section boundaries (empty line
 * sequences) and prefers breaking there instead of mid-content.
 * Falls back to fixed-size pages when no good break point exists
 * within the last 50% of a page.
 */
export async function renderFrameToPdf(
  frame: CapturedFrame,
  options: RenderPdfOptions
): Promise<PdfRenderResult> {
  const PDFDocument = (await import("pdfkit")).default

  const {
    pageWidth = 595,
    pageHeight = 842,
    lineHeight = 1.4,
    paddingX = 24,
    paddingY = 20,
    theme,
    fontPath,
    fontBoldPath,
    fontItalicPath,
    charWidthRatio = 0.6,
  } = options

  // Auto-fit fontSize to frame width if not explicitly set.
  // Same approach as the web renderer's CSS clamp formula:
  //   fontSize = contentWidth / (cols * charWidthRatio)
  const contentWidth = pageWidth - paddingX * 2
  const fontSize = options.fontSize ?? Math.min(10, contentWidth / (frame.cols * charWidthRatio))

  // Trim trailing empty lines
  const lines = trimTrailingEmptyLines(frame.lines)
  if (lines.length === 0) {
    throw new Error("No content to render")
  }

  // Calculate layout with resolved fontSize
  const resolvedOptions = { ...options, pageWidth, pageHeight, fontSize, lineHeight, paddingX, paddingY, charWidthRatio }
  const layout = calculatePdfLayout(lines.length, resolvedOptions)

  // Compute smart page breaks
  const breakPoints = findBreakPoints(lines)
  const pageStarts = computePageBreaks(lines.length, layout.linesPerPage, breakPoints)

  // Create PDF document
  const doc = new PDFDocument({
    size: [pageWidth, pageHeight] as [number, number],
    margin: 0,
    autoFirstPage: true,
  })

  // Collect output as Buffer
  const buffers: Buffer[] = []
  doc.on("data", (chunk: Buffer) => buffers.push(chunk))
  const pdfPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)))
    doc.on("error", reject)
  })

  // Register fonts
  let hasBoldFont = false
  let hasItalicFont = false

  if (fontPath) {
    const fontBuffer = await loadFontBuffer(fontPath)
    doc.registerFont("mono", fontBuffer)
    if (fontBoldPath) {
      doc.registerFont("mono-bold", await loadFontBuffer(fontBoldPath))
      hasBoldFont = true
    }
    if (fontItalicPath) {
      doc.registerFont("mono-italic", await loadFontBuffer(fontItalicPath))
      hasItalicFont = true
    }
  } else {
    // Fallback to built-in Courier
    doc.registerFont("mono", "Courier")
    doc.registerFont("mono-bold", "Courier-Bold")
    doc.registerFont("mono-italic", "Courier-Oblique")
    hasBoldFont = true
    hasItalicFont = true
  }

  doc.font("mono")
  doc.fontSize(fontSize)

  // Render pages using smart break positions
  for (let pageIdx = 0; pageIdx < pageStarts.length; pageIdx++) {
    if (pageIdx > 0) {
      doc.addPage({
        size: [pageWidth, pageHeight] as [number, number],
        margin: 0,
      })
    }

    // Fill page background
    doc.save()
    doc.fillColor(theme.background)
    doc.rect(0, 0, pageWidth, pageHeight).fill()
    doc.restore()

    // Determine line range for this page
    const start = pageStarts[pageIdx]!
    const end = pageIdx + 1 < pageStarts.length
      ? pageStarts[pageIdx + 1]!
      : lines.length
    const pageLines = lines.slice(start, end)

    let y = paddingY
    for (const line of pageLines) {
      renderLineToPdf(doc, line, y, {
        paddingX,
        contentWidth: layout.contentWidth,
        pageWidth,
        fontSize,
        charWidth: layout.charWidth,
        lineHeightPt: layout.lineHeightPt,
        theme,
        hasBoldFont,
        hasItalicFont,
      })
      y += layout.lineHeightPt
    }
  }

  // Finalize
  doc.end()
  const buffer = await pdfPromise

  return {
    buffer,
    totalLines: lines.length,
    pageCount: pageStarts.length,
  }
}
