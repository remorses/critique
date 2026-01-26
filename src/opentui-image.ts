// Generic opentui CapturedFrame to image conversion using satori + resvg.
// No critique-specific dependencies - can be reused for any opentui app.

import { tmpdir } from "os"
import { join } from "path"
import fs from "fs"
import { TextAttributes, rgbToHex, type RGBA } from "@opentui/core"
import type { CapturedFrame, CapturedLine, CapturedSpan } from "@opentui/core"
import satori from "satori"
import { Resvg } from "@resvg/resvg-js"
import sharp from "sharp"

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/** Theme colors needed for rendering */
export interface ImageTheme {
  /** Background color as hex string */
  background: string
  /** Text color as hex string */
  text: string
}

/** Options for rendering a single image */
export interface RenderImageOptions {
  /** Image width in pixels (default: 1200) */
  width?: number
  /** Image height in pixels (if not set, calculated from content) */
  height?: number
  /** Font size in pixels (default: 14) */
  fontSize?: number
  /** Line height multiplier (default: 1.95) */
  lineHeight?: number
  /** Horizontal padding in pixels (default: 24) */
  paddingX?: number
  /** Vertical padding in pixels (default: 20) */
  paddingY?: number
  /** Theme colors */
  theme: ImageTheme
  /** Output format (default: "png") */
  format?: "webp" | "png" | "jpeg"
  /** Quality for lossy formats 0-100 (default: 90) */
  quality?: number
}

/** Options for rendering paginated images */
export interface RenderPaginatedOptions extends RenderImageOptions {
  /** Maximum lines per image before splitting (default: 70) */
  maxLinesPerImage?: number
  /** Whether to save to temp files (default: true) */
  saveToTemp?: boolean
}

/** Result from paginated render */
export interface PaginatedRenderResult {
  /** Array of image buffers */
  images: Buffer[]
  /** Paths where images were saved (empty if saveToTemp=false) */
  paths: string[]
  /** Total number of content lines */
  totalLines: number
  /** Number of images generated */
  imageCount: number
}

/** Layout calculation result */
export interface FrameLayout {
  /** Total lines in the frame after trimming */
  totalLines: number
  /** Number of lines that will be visible */
  visibleLines: number
  /** Calculated line height in pixels */
  lineHeightPx: number
  /** Height available for content */
  availableHeight: number
  /** Actual content height */
  contentHeight: number
  /** Final image height */
  imageHeight: number
}

type SatoriNode = {
  type: string
  props: {
    style?: Record<string, string | number>
    children?: SatoriNode[] | string
  }
}

// ─────────────────────────────────────────────────────────────
// Font Handling
// ─────────────────────────────────────────────────────────────

const FONT_NAME = "JetBrains Mono"
const FONT_URL = new URL("../public/jetbrains-mono-regular.ttf", import.meta.url)
let cachedFontData: ArrayBuffer | null = null

function getFontData(): ArrayBuffer {
  if (cachedFontData) return cachedFontData
  const buffer = fs.readFileSync(FONT_URL)
  cachedFontData = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  return cachedFontData
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
export function isLineEmpty(line: CapturedLine): boolean {
  if (line.spans.length === 0) return true
  return line.spans.every((span) => span.text.trim() === "")
}

/**
 * Trim empty lines from end of lines array.
 */
export function trimTrailingEmptyLines(lines: CapturedLine[]): CapturedLine[] {
  let result = [...lines]
  while (result.length > 0 && isLineEmpty(result[result.length - 1]!)) {
    result = result.slice(0, -1)
  }
  return result
}

/**
 * Calculate layout metrics for a frame.
 */
export function calculateFrameLayout(
  frame: CapturedFrame,
  options: {
    fontSize?: number
    lineHeight?: number
    paddingY?: number
    height?: number
  }
): FrameLayout {
  const {
    fontSize = 14,
    lineHeight = 1.95,
    paddingY = 20,
    height,
  } = options

  const lines = trimTrailingEmptyLines(frame.lines)
  const totalLines = lines.length

  const lineHeightPx = Math.round(fontSize * lineHeight)

  // If height specified, calculate how many lines fit
  let visibleLines: number
  let availableHeight: number
  let imageHeight: number

  if (height) {
    availableHeight = height - paddingY * 2
    visibleLines = Math.min(totalLines, Math.floor(availableHeight / lineHeightPx))
    imageHeight = height
  } else {
    visibleLines = totalLines
    availableHeight = visibleLines * lineHeightPx
    imageHeight = availableHeight + paddingY * 2
  }

  const contentHeight = visibleLines * lineHeightPx

  return {
    totalLines,
    visibleLines,
    lineHeightPx,
    availableHeight,
    contentHeight,
    imageHeight,
  }
}

// ─────────────────────────────────────────────────────────────
// Span Processing
// ─────────────────────────────────────────────────────────────

/**
 * Convert opentui CapturedSpan to satori text node.
 * Handles: color, bold, italic, dim
 */
export function spanToTextNode(span: CapturedSpan): SatoriNode {
  const style: Record<string, string | number> = {
    display: "flex",
    alignItems: "center",
  }

  const fg = rgbaToHexOrNull(span.fg)
  if (fg) {
    style.color = fg
  }
  if (span.attributes & TextAttributes.BOLD) {
    style.fontWeight = 700
  }
  if (span.attributes & TextAttributes.ITALIC) {
    style.fontStyle = "italic"
  }
  if (span.attributes & TextAttributes.DIM) {
    style.opacity = 0.5
  }

  return {
    type: "div",
    props: {
      style,
      children: span.text,
    },
  }
}

/**
 * Merge adjacent spans that share the same text styling.
 * This preserves natural spacing between styled segments by reducing
 * the number of inline nodes and allowing the renderer to kern text.
 */
function mergeSpans(spans: CapturedSpan[]): CapturedSpan[] {
  const merged: CapturedSpan[] = []
  let last: CapturedSpan | null = null
  let lastKey = ""

  for (const span of spans) {
    const fg = rgbaToHexOrNull(span.fg) ?? "none"
    const key = `${fg}|${span.attributes}`

    if (last && key === lastKey) {
      last.text += span.text
      continue
    }

    const next = { ...span, text: span.text }
    merged.push(next)
    last = next
    lastKey = key
  }

  return merged
}

// ─────────────────────────────────────────────────────────────
// Node Conversion Functions
// ─────────────────────────────────────────────────────────────

/**
 * Convert opentui CapturedLine to satori container node.
 * Uses explicit height and flex layout with gap: 0.
 */
export function lineToContainerNode(
  line: CapturedLine,
  options: {
    backgroundColor: string
    lineHeight: number
    fontSize: number
    width?: number
  }
): SatoriNode {
  const { backgroundColor, lineHeight, fontSize, width } = options

  const lineHeightPx = Math.round(fontSize * lineHeight)

  // Convert spans to text nodes
  const mergedSpans = mergeSpans(line.spans)
  let textChildren = mergedSpans.map((span) => spanToTextNode(span))

  // Get line background from last span (for diff coloring)
  const lastSpan = line.spans[line.spans.length - 1]
  const lineBackground = lastSpan
    ? (rgbaToHexOrNull(lastSpan.bg) || backgroundColor)
    : backgroundColor

  if (textChildren.length === 0) {
    textChildren = [
      {
        type: "div",
        props: { children: " " },
      },
    ]
  }

  // Spacer to fill remaining width with line's background
  const spacer: SatoriNode = {
    type: "div",
    props: {
      style: {
        flex: 1,
        height: "100%",
        backgroundColor: lineBackground,
      },
    },
  }

  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        width: width ?? "100%",
        height: lineHeightPx,
        backgroundColor: lineBackground,
        whiteSpace: "pre",
      },
      children: [...textChildren, spacer],
    },
  }
}

/**
 * Convert entire CapturedFrame to satori root node.
 */
export function frameToRootNode(
  lines: CapturedLine[],
  options: RenderImageOptions & { imageHeight: number }
): SatoriNode {
  const {
    width = 1200,
    fontSize = 14,
    lineHeight = 1.95,
    paddingX = 24,
    paddingY = 20,
    theme,
    imageHeight,
  } = options

  const contentWidth = width - paddingX * 2

  const lineNodes = lines.map((line) =>
    lineToContainerNode(line, {
      backgroundColor: theme.background,
      lineHeight,
      fontSize,
      width: contentWidth,
    })
  )

  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 0,
        width,
        height: imageHeight,
        backgroundColor: theme.background,
        color: theme.text,
        fontFamily: FONT_NAME,
        fontSize,
        lineHeight,
        whiteSpace: "pre",
        paddingTop: paddingY,
        paddingBottom: paddingY,
        paddingLeft: paddingX,
        paddingRight: paddingX,
      },
      children: lineNodes,
    },
  }
}

// ─────────────────────────────────────────────────────────────
// Rendering Helpers
// ─────────────────────────────────────────────────────────────

async function renderSvg(rootNode: SatoriNode, width: number, height: number): Promise<string> {
  const fontData = getFontData()
  return satori(rootNode as any, {
    width,
    height,
    fonts: [
      {
        name: FONT_NAME,
        data: fontData,
        weight: 400,
        style: "normal",
      },
    ],
  })
}

function renderPng(svg: string): Buffer {
  const resvg = new Resvg(svg)
  const pngData = resvg.render().asPng()
  return Buffer.from(pngData)
}

async function encodeImage(
  pngBuffer: Buffer,
  format: "webp" | "png" | "jpeg",
  quality: number
): Promise<Buffer> {
  if (format === "png") {
    return pngBuffer
  }

  if (format === "webp") {
    return sharp(pngBuffer).webp({ quality }).toBuffer()
  }

  return sharp(pngBuffer).jpeg({ quality }).toBuffer()
}

// ─────────────────────────────────────────────────────────────
// High-level Rendering Functions
// ─────────────────────────────────────────────────────────────

/**
 * Render CapturedFrame to a single image buffer.
 * Height auto-calculated from content if not specified.
 */
export async function renderFrameToImage(
  frame: CapturedFrame,
  options: RenderImageOptions
): Promise<Buffer> {
  const {
    width = 1200,
    height,
    fontSize = 14,
    lineHeight = 1.95,
    paddingY = 20,
    format = "png",
    quality = 90,
  } = options

  // Trim empty lines
  const lines = trimTrailingEmptyLines(frame.lines)
  if (lines.length === 0) {
    throw new Error("No content to render")
  }

  // Calculate layout
  const layout = calculateFrameLayout(frame, { fontSize, lineHeight, paddingY, height })

  // Take only visible lines
  const visibleLines = lines.slice(0, layout.visibleLines)

  // Build satori node tree
  const rootNode = frameToRootNode(visibleLines, {
    ...options,
    imageHeight: layout.imageHeight,
  })

  // Render to SVG then PNG
  const svg = await renderSvg(rootNode, width, layout.imageHeight)
  const png = renderPng(svg)

  // Encode to requested format
  return encodeImage(png, format ?? "png", quality ?? 90)
}

/**
 * Render CapturedFrame to multiple images with pagination.
 * Splits content when exceeding maxLinesPerImage.
 */
export async function renderFrameToPaginatedImages(
  frame: CapturedFrame,
  options: RenderPaginatedOptions
): Promise<PaginatedRenderResult> {
  const {
    width = 1200,
    fontSize = 14,
    lineHeight = 1.95,
    paddingX = 24,
    paddingY = 20,
    maxLinesPerImage = 70,
    format = "png",
    quality = 90,
    saveToTemp = true,
  } = options

  // Trim empty lines
  const lines = trimTrailingEmptyLines(frame.lines)
  if (lines.length === 0) {
    throw new Error("No content to render")
  }

  const lineHeightPx = Math.round(fontSize * lineHeight)

  // Split into chunks
  const chunks: CapturedLine[][] = []
  for (let i = 0; i < lines.length; i += maxLinesPerImage) {
    chunks.push(lines.slice(i, i + maxLinesPerImage))
  }

  const images: Buffer[] = []
  const paths: string[] = []
  const timestamp = Date.now()

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex]!
    const imageHeight = chunk.length * lineHeightPx + paddingY * 2

    const rootNode = frameToRootNode(chunk, {
      ...options,
      width,
      fontSize,
      lineHeight,
      paddingX,
      paddingY,
      imageHeight,
    })

    const svg = await renderSvg(rootNode, width, imageHeight)
    const png = renderPng(svg)
    const buffer = await encodeImage(png, format, quality)
    images.push(buffer)

    if (saveToTemp) {
      const filename = `opentui-${timestamp}-${chunkIndex + 1}.${format}`
      const filepath = join(tmpdir(), filename)
      fs.writeFileSync(filepath, buffer)
      paths.push(filepath)
    }
  }

  return {
    images,
    paths,
    totalLines: lines.length,
    imageCount: chunks.length,
  }
}
