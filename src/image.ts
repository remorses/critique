// Critique-specific image rendering.
// Uses opentui-image.ts for generic frame-to-image conversion.
// Adds theme resolution and diff/review-specific rendering.

import type { CapturedFrame } from "@opentui/core"
import { getResolvedTheme, rgbaToHex } from "./themes.ts"
import {
  renderFrameToImage,
  renderFrameToPaginatedImages,
  trimTrailingEmptyLines,
  calculateFrameLayout,
  type RenderImageOptions,
  type RenderPaginatedOptions,
  type PaginatedRenderResult,
  type ImageTheme,
  type FrameLayout,
} from "./opentui-image.ts"

// Re-export types from opentui-image for convenience
export type { ImageTheme, FrameLayout }

// ============================================================================
// Critique-specific Options and Types
// ============================================================================

export interface RenderToImagesOptions {
  /** Theme name for colors (default: "tokyonight") */
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

export interface OgImageOptions {
  /** Theme name for colors (default: "github-light") */
  themeName?: string
  /** Image width in pixels (default: 1200) */
  width?: number
  /** Image height in pixels (default: 630) */
  height?: number
  /** Font size in pixels (default: 16) */
  fontSize?: number
  /** Line height multiplier (default: 1.5) */
  lineHeight?: number
  /** Output format: webp, png, or jpeg (default: png) */
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

// ============================================================================
// Theme Resolution Helper
// ============================================================================

/**
 * Convert theme name to ImageTheme for opentui-image.
 */
function resolveTheme(themeName: string): ImageTheme {
  const theme = getResolvedTheme(themeName)
  return {
    background: rgbaToHex(theme.background),
    text: rgbaToHex(theme.text),
  }
}

// ============================================================================
// Paginated Image Rendering
// ============================================================================

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
  const {
    themeName = "tokyonight",
    imageWidth = 1200,
    fontSize = 14,
    lineHeight = 1.9,
    maxLinesPerImage = 70,
    format = "webp",
    quality = 85,
  } = options

  const theme = resolveTheme(themeName)

  const result = await renderFrameToPaginatedImages(frame, {
    width: imageWidth,
    fontSize,
    lineHeight,
    paddingX: 32,
    paddingY: 24,
    maxLinesPerImage,
    format,
    quality,
    theme,
    saveToTemp: true,
  })

  return result
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

  const paddingY = 20
  const paddingX = 24

  const layout = calculateFrameLayout(frame, {
    fontSize,
    lineHeight,
    paddingY,
    height,
  })

  return {
    totalLines: layout.totalLines,
    visibleLines: layout.visibleLines,
    maxLines: Math.floor(layout.availableHeight / layout.effectiveLineHeight),
    width,
    height,
    paddingX,
    paddingY,
    lineHeightPx: layout.lineHeightPx,
    gapOverlap: layout.gapOverlap,
    effectiveLineHeight: layout.effectiveLineHeight,
    availableHeight: layout.availableHeight,
    contentHeight: layout.contentHeight,
    unusedHeight: layout.availableHeight - layout.contentHeight,
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
  const {
    themeName = "github-light",
    width = 1200,
    height = 630,
    fontSize = 16,
    lineHeight = 1.5,
    format = "png",
    quality = 90,
  } = options

  const theme = resolveTheme(themeName)

  return renderFrameToImage(frame, {
    width,
    height,
    fontSize,
    lineHeight,
    paddingX: 24,
    paddingY: 20,
    format,
    quality,
    theme,
  })
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

  const cols = options.cols ?? 120
  const themeName = options.themeName ?? "github-light"

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
