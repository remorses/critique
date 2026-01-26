// Terminal output to image conversion using takumi.
// Converts CapturedFrame from opentui test renderer to images, splitting into multiple pages if needed.
// Exports renderFrameToImages(), renderDiffToImages(), renderReviewToImages() for library and CLI use.

import { tmpdir } from "os"
import { join } from "path"
import fs from "fs"
import { TextAttributes, rgbToHex, type RGBA } from "@opentui/core"
import type { CapturedFrame, CapturedLine, CapturedSpan } from "@opentui/core"
import { getResolvedTheme, rgbaToHex } from "./themes.ts"

// Cached renderer instance - initialized lazily and reused across all render calls
let cachedRenderer: import("@takumi-rs/core").Renderer | null = null
let rendererInitPromise: Promise<import("@takumi-rs/core").Renderer> | null = null

/**
 * Get or create a cached Renderer instance with fonts preloaded.
 * Ensures consistent rendering by reusing the same renderer.
 */
async function getRenderer(): Promise<import("@takumi-rs/core").Renderer> {
  if (cachedRenderer) {
    return cachedRenderer
  }

  // Avoid race conditions - if already initializing, wait for that
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

export interface RenderToImagesOptions {
  /** Theme name for colors */
  themeName?: string
  /** Image width in pixels (default: 1200) */
  imageWidth?: number
  /** Font size in pixels (default: 14) */
  fontSize?: number
  /** Line height multiplier (default: 1.9) */
  lineHeight?: number
  /** Maximum lines per image before splitting (default: 70) */
  maxLinesPerImage?: number
  /** Output format: webp, png, or jpeg (default: webp) */
  format?: "webp" | "png" | "jpeg"
  /** Quality for lossy formats 0-100 (default: 85) */
  quality?: number
}

export interface RenderResult {
  /** Array of image buffers */
  images: Buffer[]
  /** Paths where images were saved */
  paths: string[]
  /** Total number of lines in the output */
  totalLines: number
  /** Number of images generated */
  imageCount: number
}

/**
 * Convert RGBA to hex string, returning null for transparent colors
 */
function rgbaToHexOrNull(rgba: RGBA): string | null {
  if (rgba.a === 0) return null
  return rgbToHex(rgba)
}

/**
 * Convert captured span to takumi text node.
 * Following shiki-image pattern: only display: inline and color styles.
 */
function spanToNode(
  span: CapturedSpan,
  text: typeof import("@takumi-rs/helpers").text
) {
  const style: Record<string, string | number> = {
    display: "inline",
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

  return text(span.text, style as any)
}

/**
 * Convert a captured line to a takumi container node.
 * Uses negative margin to eliminate gaps (takumi doesn't respect container height for backgrounds).
 */
function lineToNode(
  line: CapturedLine,
  container: typeof import("@takumi-rs/helpers").container,
  text: typeof import("@takumi-rs/helpers").text,
  backgroundColor: string,
  lineHeight: number,
  fontSize: number
) {
  const lineHeightPx = Math.round(fontSize * lineHeight)
  
  // Calculate negative margin to eliminate gaps between lines
  // The gap is proportional to the extra space from line-height (lineHeight - 1) * fontSize
  // We use ~50% of that as overlap to close the gaps
  const gapOverlap = Math.round((lineHeight - 1) * fontSize * 0.5)

  // Get text children from spans, or use a visible character if empty
  let textChildren = line.spans.map((span) => spanToNode(span, text))
  if (textChildren.length === 0) {
    textChildren = [text("X", { color: backgroundColor })]
  }

  // Add a flex-grow spacer at the end to fill remaining width
  // This ensures the background color extends to the full line width
  const spacer = container({
    style: {
      flexGrow: 1,
      height: "100%",
      backgroundColor,
    },
    children: [],
  })

  return container({
    style: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      width: "100%",
      height: lineHeightPx,
      marginBottom: -gapOverlap,
      backgroundColor,
    },
    children: [...textChildren, spacer],
  })
}

/**
 * Check if a line is empty (no spans or only whitespace)
 */
function isLineEmpty(line: CapturedLine): boolean {
  if (line.spans.length === 0) return true
  return line.spans.every((span) => span.text.trim() === "")
}

/**
 * Trim empty lines from the end of the lines array
 */
function trimEmptyLines(lines: CapturedLine[]): CapturedLine[] {
  let result = [...lines]
  while (result.length > 0 && isLineEmpty(result[result.length - 1]!)) {
    result = result.slice(0, -1)
  }
  return result
}

/**
 * Render a CapturedFrame to images.
 * This is the main rendering function that takes opentui's captured frame format.
 *
 * @param frame - CapturedFrame from opentui test renderer
 * @param options - Rendering options
 * @returns Promise with image buffers and saved file paths
 */
export async function renderFrameToImages(
  frame: CapturedFrame,
  options: RenderToImagesOptions = {}
): Promise<RenderResult> {
  // Try to import takumi helpers - it's an optional dependency
  let takumiHelpers: typeof import("@takumi-rs/helpers")

  try {
    takumiHelpers = await import("@takumi-rs/helpers")
  } catch {
    throw new Error(
      "takumi is not installed. Install it with: bun add @takumi-rs/core @takumi-rs/helpers"
    )
  }

  const { container, text } = takumiHelpers

  const {
    themeName = "tokyonight",
    imageWidth = 1200,
    fontSize = 14,
    lineHeight = 1.9,
    maxLinesPerImage = 70,
    format = "webp",
    quality = 85,
  } = options

  // Trim empty lines from the frame
  let lines = trimEmptyLines(frame.lines)

  if (lines.length === 0) {
    throw new Error("No content to render")
  }

  // Get theme colors
  const theme = getResolvedTheme(themeName)
  const backgroundColor = rgbaToHex(theme.background)
  const textColor = rgbaToHex(theme.text)

  // Calculate dimensions
  const lineHeightPx = Math.round(fontSize * lineHeight)
  const paddingY = 24
  const paddingX = 32

  // Split lines into chunks
  const chunks: CapturedLine[][] = []
  for (let i = 0; i < lines.length; i += maxLinesPerImage) {
    chunks.push(lines.slice(i, i + maxLinesPerImage))
  }

  // Get cached renderer (fonts already loaded)
  const renderer = await getRenderer()

  const images: Buffer[] = []
  const paths: string[] = []
  const timestamp = Date.now()

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex]!
    const imageHeight = chunk.length * lineHeightPx + paddingY * 2

    // Build the root container for this chunk
    const rootNode = container({
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 0,
        width: "100%",
        height: "100%",
        backgroundColor,
        color: textColor,
        fontFamily: "monospace",
        fontSize,
        whiteSpace: "pre",
        paddingTop: paddingY,
        paddingBottom: paddingY,
        paddingLeft: paddingX,
        paddingRight: paddingX,
      },
      children: chunk.map((line) => lineToNode(line, container, text, backgroundColor, lineHeight, fontSize)),
    })

    // Render to image
    const imageBuffer = await renderer.render(rootNode, {
      width: imageWidth,
      height: imageHeight,
      format,
      quality,
    })

    images.push(Buffer.from(imageBuffer))

    // Save to /tmp
    const filename = `critique-${timestamp}-${chunkIndex + 1}.${format}`
    const filepath = join(tmpdir(), filename)
    fs.writeFileSync(filepath, imageBuffer)
    paths.push(filepath)
  }

  return {
    images,
    paths,
    totalLines: lines.length,
    imageCount: chunks.length,
  }
}

/**
 * Render a git diff to images.
 * Uses opentui test renderer to capture the diff view, then converts to images.
 *
 * @param diffContent - Raw git diff string
 * @param options - Rendering and image options
 * @returns Promise with image buffers and saved file paths
 */
export async function renderDiffToImages(
  diffContent: string,
  options: {
    cols?: number
    rows?: number
    themeName?: string
  } & RenderToImagesOptions = {}
): Promise<RenderResult> {
  const { renderDiffToFrame } = await import("./web-utils.ts")

  const cols = options.cols ?? 120
  const rows = options.rows ?? 10000
  const themeName = options.themeName ?? "tokyonight"

  // Render diff to captured frame using opentui test renderer
  const frame = await renderDiffToFrame(diffContent, {
    cols,
    rows,
    themeName,
  })

  // Convert frame to images
  return renderFrameToImages(frame, {
    ...options,
    themeName,
  })
}

/**
 * Render a review to images.
 * Uses opentui test renderer to capture the review view, then converts to images.
 *
 * @param options - Review data and rendering options
 * @returns Promise with image buffers and saved file paths
 */
export async function renderReviewToImages(
  options: {
    hunks: any[]
    reviewData: any
    cols?: number
    rows?: number
    themeName?: string
  } & RenderToImagesOptions
): Promise<RenderResult> {
  const { renderReviewToFrame } = await import("./web-utils.ts")

  const cols = options.cols ?? 120
  const rows = options.rows ?? 10000
  const themeName = options.themeName ?? "tokyonight"

  // Render review to captured frame using opentui test renderer
  const frame = await renderReviewToFrame({
    hunks: options.hunks,
    reviewData: options.reviewData,
    cols,
    rows,
    themeName,
  })

  // Convert frame to images
  return renderFrameToImages(frame, {
    ...options,
    themeName,
  })
}

// ============================================================================
// OG Image Generation
// ============================================================================

export interface OgImageOptions {
  /** Theme name for colors */
  themeName?: string
  /** Image width in pixels (default: 1200) */
  width?: number
  /** Image height in pixels (default: 630) */
  height?: number
  /** Font size in pixels (default: 18 for OG images - larger for readability) */
  fontSize?: number
  /** Line height multiplier (default: 1.7) */
  lineHeight?: number
  /** Output format: webp, png, or jpeg (default: png for compatibility) */
  format?: "webp" | "png" | "jpeg"
  /** Quality for lossy formats 0-100 (default: 90) */
  quality?: number
}

export interface OgImageLayout {
  /** Total lines available in the frame */
  totalLines: number
  /** Number of lines that fit in the image */
  visibleLines: number
  /** Maximum lines that could fit based on calculations */
  maxLines: number
  /** Image dimensions */
  width: number
  height: number
  /** Padding values */
  paddingX: number
  paddingY: number
  /** Line height in pixels */
  lineHeightPx: number
  /** Gap overlap for negative margins */
  gapOverlap: number
  /** Effective line height after overlap */
  effectiveLineHeight: number
  /** Available height for content */
  availableHeight: number
  /** Actual content height (visibleLines * effectiveLineHeight) */
  contentHeight: number
  /** Unused vertical space at the bottom */
  unusedHeight: number
}

/**
 * Calculate the layout for an OG image without rendering.
 * Useful for testing and debugging layout issues.
 *
 * @param frame - CapturedFrame from opentui test renderer
 * @param options - OG image options
 * @returns Layout information
 */
export function calculateOgImageLayout(
  frame: CapturedFrame,
  options: OgImageOptions = {}
): OgImageLayout {
  const {
    width = 1200,
    height = 630,
    fontSize = 16,
    lineHeight = 1.5,
  } = options

  // Trim empty lines from the frame
  const lines = trimEmptyLines(frame.lines)

  // Fixed padding and dimensions
  const paddingY = 20
  const paddingX = 24
  const lineHeightPx = Math.round(fontSize * lineHeight)
  const gapOverlap = Math.round((lineHeight - 1) * fontSize * 0.5)
  const effectiveLineHeight = lineHeightPx - gapOverlap

  // Calculate how many lines fit
  const availableHeight = height - paddingY * 2
  const maxLines = Math.floor(availableHeight / effectiveLineHeight)
  const visibleLines = Math.min(lines.length, maxLines)

  // Calculate actual content height and unused space
  const contentHeight = visibleLines * effectiveLineHeight
  const unusedHeight = availableHeight - contentHeight

  return {
    totalLines: lines.length,
    visibleLines,
    maxLines,
    width,
    height,
    paddingX,
    paddingY,
    lineHeightPx,
    gapOverlap,
    effectiveLineHeight,
    availableHeight,
    contentHeight,
    unusedHeight,
  }
}

/**
 * Render a CapturedFrame to a single OG image (1200x630 by default).
 * Takes only the first N lines that fit within the fixed height.
 *
 * @param frame - CapturedFrame from opentui test renderer
 * @param options - OG image options
 * @returns Promise with image buffer
 */
export async function renderFrameToOgImage(
  frame: CapturedFrame,
  options: OgImageOptions = {}
): Promise<Buffer> {
  // Try to import takumi helpers - it's an optional dependency
  let takumiHelpers: typeof import("@takumi-rs/helpers")

  try {
    takumiHelpers = await import("@takumi-rs/helpers")
  } catch {
    throw new Error(
      "takumi is not installed. Install it with: bun add @takumi-rs/core @takumi-rs/helpers"
    )
  }

  const { container, text } = takumiHelpers

  const {
    themeName = "tokyonight",
    width = 1200,
    height = 630,
    fontSize = 16,
    lineHeight = 1.5,
    format = "png",
    quality = 90,
  } = options

  // Trim empty lines from the frame
  let lines = trimEmptyLines(frame.lines)

  if (lines.length === 0) {
    throw new Error("No content to render")
  }

  // Get theme colors
  const theme = getResolvedTheme(themeName)
  const backgroundColor = rgbaToHex(theme.background)
  const textColor = rgbaToHex(theme.text)

  // Fixed padding and dimensions
  const paddingY = 20
  const paddingX = 24
  const lineHeightPx = Math.round(fontSize * lineHeight)
  const gapOverlap = Math.round((lineHeight - 1) * fontSize * 0.5)
  const effectiveLineHeight = lineHeightPx - gapOverlap

  // Calculate how many lines fit, take that many
  const availableHeight = height - paddingY * 2
  const maxLines = Math.floor(availableHeight / effectiveLineHeight)
  const visibleLines = lines.slice(0, maxLines)

  // Get cached renderer (fonts already loaded)
  const renderer = await getRenderer()

  // Calculate content width (image width minus padding)
  const contentWidth = width - paddingX * 2

  // Build line nodes with explicit width for proper background fill
  const lineNodes = visibleLines.map((line) => {
    const textChildren = line.spans.map((span) => spanToNode(span, text))
    
    // Get the last span's background color for the spacer
    // This ensures the spacer matches the line's color (e.g., green for additions)
    const lastSpan = line.spans[line.spans.length - 1]
    const lineBackground = lastSpan ? (rgbaToHexOrNull(lastSpan.bg) || backgroundColor) : backgroundColor
    
    // Empty lines need a placeholder
    if (textChildren.length === 0) {
      textChildren.push(text(" ", { color: backgroundColor }))
    }

    // Add a flex spacer container that fills remaining width with the line's background
    const spacer = container({
      style: {
        flex: 1,
        height: "100%",
        backgroundColor: lineBackground,  // Match line's background, not default
      },
      children: [],
    })

    return container({
      style: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        width: contentWidth,  // Explicit pixel width
        height: lineHeightPx,
        marginBottom: -gapOverlap,
        backgroundColor: lineBackground,  // Line container also uses line's bg
      },
      children: [...textChildren, spacer],
    })
  })

  // Build the root container
  const rootNode = container({
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 0,
      width,  // Explicit pixel width
      height, // Explicit pixel height
      backgroundColor,
      color: textColor,
      fontFamily: "monospace",
      fontSize,
      whiteSpace: "pre",
      paddingTop: paddingY,
      paddingBottom: paddingY,
      paddingLeft: paddingX,
      paddingRight: paddingX,
    },
    children: lineNodes,
  })

  // Render to image with fixed dimensions
  const imageBuffer = await renderer.render(rootNode, {
    width,
    height,
    format,
    quality,
  })

  return Buffer.from(imageBuffer)
}

/**
 * Render a git diff to an OG image (1200x630 by default).
 * Shows the first few lines of the diff that fit within the image.
 *
 * @param diffContent - Raw git diff string
 * @param options - OG image and rendering options
 * @returns Promise with image buffer
 */
export async function renderDiffToOgImage(
  diffContent: string,
  options: OgImageOptions & { cols?: number } = {}
): Promise<Buffer> {
  const { renderDiffToFrame } = await import("./web-utils.ts")

  const cols = options.cols ?? 120  // Match ~1152px content width at 16px font
  const themeName = options.themeName ?? "tokyonight"

  // Render diff to captured frame
  const frame = await renderDiffToFrame(diffContent, {
    cols,
    rows: 200,
    themeName,
  })

  // Convert frame to OG image
  return renderFrameToOgImage(frame, {
    ...options,
    themeName,
  })
}
