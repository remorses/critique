// Generic opentui CapturedFrame to image conversion using takumi.
// No critique-specific dependencies - can be reused for any opentui app.

import { tmpdir } from "os"
import { join } from "path"
import fs from "fs"
import { TextAttributes, rgbToHex, type RGBA } from "@opentuah/core"
import type { CapturedFrame, CapturedLine, CapturedSpan } from "@opentuah/core"

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
  /** Line height multiplier (default: 1.5) */
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

// ─────────────────────────────────────────────────────────────
// Cached Renderer Singleton
// ─────────────────────────────────────────────────────────────

let cachedRenderer: import("@takumi-rs/core").Renderer | null = null
let rendererInitPromise: Promise<import("@takumi-rs/core").Renderer> | null = null

/**
 * Get cached takumi Renderer with fonts preloaded.
 * Creates on first call, reuses thereafter.
 * Handles race conditions during initialization.
 */
export async function getRenderer(): Promise<import("@takumi-rs/core").Renderer> {
  if (cachedRenderer) {
    return cachedRenderer
  }

  if (rendererInitPromise) {
    return rendererInitPromise
  }

  rendererInitPromise = (async () => {
    const { Renderer } = await import("@takumi-rs/core")
    const renderer = new Renderer()
    await renderer.loadFontsAsync([])
    cachedRenderer = renderer
    return renderer
  })()

  return rendererInitPromise
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
 * Uses standard CSS line-height - no magic gap calculations.
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
    lineHeight = 1.5,
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
// Node Conversion Functions
// ─────────────────────────────────────────────────────────────

/**
 * Convert opentui CapturedSpan to takumi text node.
 * Handles: color, backgroundColor, bold, italic, dim
 */
export function spanToTextNode(
  span: CapturedSpan,
  text: typeof import("@takumi-rs/helpers").text
) {
  const style: Record<string, string | number> = {
    display: "inline",
    flexShrink: 0,
  }

  const fg = rgbaToHexOrNull(span.fg)
  const bg = rgbaToHexOrNull(span.bg)

  if (fg) {
    style.color = fg
  }
  if (bg) {
    style.backgroundColor = bg
  }
  if (span.attributes & TextAttributes.BOLD) {
    style.fontWeight = "bold"
  }
  if (span.attributes & TextAttributes.ITALIC) {
    style.fontStyle = "italic"
  }
  if (span.attributes & TextAttributes.DIM) {
    style.opacity = 0.5
  }

  return text(span.text, style )
}

/**
 * Convert opentui CapturedLine to takumi container node.
 * Uses standard CSS layout - no negative margin hacks.
 */
export function lineToContainerNode(
  line: CapturedLine,
  helpers: typeof import("@takumi-rs/helpers"),
  options: {
    backgroundColor: string
    lineHeight: number
    fontSize: number
    width?: number
  }
) {
  const { container, text } = helpers
  const { backgroundColor, lineHeight, fontSize, width } = options

  const lineHeightPx = Math.round(fontSize * lineHeight)

  // Convert spans to text nodes
  let textChildren = line.spans.map((span) => spanToTextNode(span, text))
  if (textChildren.length === 0) {
    textChildren = [text("m", { color: backgroundColor })]
  }

  // Get line background from last span (for diff coloring)
  const lastSpan = line.spans[line.spans.length - 1]
  const lineBackground = lastSpan
    ? (rgbaToHexOrNull(lastSpan.bg) || backgroundColor)
    : backgroundColor

  // Spacer to fill remaining width with line's background
  const spacer = container({
    style: {
      flex: 1,
      flexShrink: 0,
      height: "100%",
      backgroundColor: lineBackground,
    },
    children: [],
  })

  return container({
    style: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      flexShrink: 0,
      width: width ?? "100%",
      height: lineHeightPx,
      backgroundColor: lineBackground,
      overflow: "hidden",  // Clip text that exceeds line width
    },
    children: [...textChildren, spacer],
  })
}

/**
 * Convert entire CapturedFrame to takumi root node.
 * Ready for rendering.
 */
export function frameToRootNode(
  lines: CapturedLine[],
  helpers: typeof import("@takumi-rs/helpers"),
  options: RenderImageOptions & { imageHeight: number }
) {
  const { container } = helpers
  const {
    width = 1200,
    fontSize = 14,
    lineHeight = 1.5,
    paddingX = 24,
    paddingY = 20,
    theme,
    imageHeight,
  } = options

  const contentWidth = width - paddingX * 2

  const lineNodes = lines.map((line) =>
    lineToContainerNode(line, helpers, {
      backgroundColor: theme.background,
      lineHeight,
      fontSize,
      width: contentWidth,
    })
  )

  return container({
    style: {
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      gap: 0,
      width,
      height: imageHeight,
      backgroundColor: theme.background,
      color: theme.text,
      fontFamily: "monospace",
      fontSize,
      whiteSpace: "pre",
      overflow: "hidden",  // Clip any content that exceeds bounds
      paddingTop: paddingY,
      paddingBottom: paddingY,
      paddingLeft: paddingX,
      paddingRight: paddingX,
    },
    children: lineNodes,
  })
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
  const helpers = await import("@takumi-rs/helpers")
  const renderer = await getRenderer()

  const {
    width = 1200,
    height,
    fontSize = 14,
    lineHeight = 1.5,
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

  // Build node tree
  const rootNode = frameToRootNode(visibleLines, helpers, {
    ...options,
    imageHeight: layout.imageHeight,
  })

  // Render
  const imageBuffer = await renderer.render(rootNode, {
    width,
    height: layout.imageHeight,
    format,
    quality,
  })

  return Buffer.from(imageBuffer)
}

/**
 * Render CapturedFrame to multiple images with pagination.
 * Splits content when exceeding maxLinesPerImage.
 */
export async function renderFrameToPaginatedImages(
  frame: CapturedFrame,
  options: RenderPaginatedOptions
): Promise<PaginatedRenderResult> {
  const helpers = await import("@takumi-rs/helpers")
  const renderer = await getRenderer()

  const {
    width = 1200,
    fontSize = 14,
    lineHeight = 1.5,
    paddingX = 24,
    paddingY = 20,
    maxLinesPerImage = 70,
    format = "png",
    quality = 90,
    saveToTemp = true,
    theme,
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

    const rootNode = frameToRootNode(chunk, helpers, {
      ...options,
      imageHeight,
    })

    const imageBuffer = await renderer.render(rootNode, {
      width,
      height: imageHeight,
      format,
      quality,
    })

    const buffer = Buffer.from(imageBuffer)
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
