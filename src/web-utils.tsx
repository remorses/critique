// Web preview generation utilities for uploading diffs to critique.work.
// Renders diff components using opentui test renderer, converts to HTML with responsive layout,
// and uploads desktop/mobile versions for shareable diff viewing.

import { exec } from "child_process"
import { promisify } from "util"
import fs from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { getResolvedTheme, rgbaToHex } from "./themes.ts"
import type { CapturedFrame, RootRenderable, CliRenderer } from "@opentui/core"
import type { IndexedHunk, ReviewYaml } from "./review/types.ts"
import { loadStoredLicenseKey } from "./license.ts"

const execAsync = promisify(exec)

// Worker URL for uploading HTML previews
export const WORKER_URL = process.env.CRITIQUE_WORKER_URL || "https://critique.work"

export interface CaptureOptions {
  cols: number
  maxRows: number
  themeName: string
  title?: string
  /** Wrap mode for long lines (default: "word") */
  wrapMode?: "word" | "char" | "none"
}

export interface UploadResult {
  url: string
  id: string
  ogImageUrl?: string
  expiresInDays?: number | null
}

function renderExpiryNotice(options: { textColor: string; mutedColor: string }) {
  const buyUrl = `${WORKER_URL}/buy`
  return (
    <box style={{ flexDirection: "column", paddingBottom: 1, paddingLeft: 1 }}>
      <box style={{ flexDirection: "row" }}>
        <text fg={options.textColor}>This page will expire in 7 days. </text>
        <text fg={options.textColor}>Get unlimited links and support the project: </text>
        <text fg={options.textColor}>{buyUrl}</text>
      </box>
    </box>
  )
}

function shouldShowExpiryNotice(): boolean {
  if (process.env.CRITIQUE_SHOW_EXPIRY === "1") {
    return true
  }
  return !loadStoredLicenseKey()
}

/**
 * Calculate the actual content height from root's children after layout.
 * Returns the maximum bottom edge (top + height) of all children.
 */
function getContentHeight(root: RootRenderable): number {
  const children = root.getChildren()
  if (children.length === 0) return 0
  
  let maxBottom = 0
  for (const child of children) {
    const layout = child.getLayoutNode().getComputedLayout()
    const bottom = layout.top + layout.height
    if (bottom > maxBottom) {
      maxBottom = bottom
    }
  }
  return Math.ceil(maxBottom)
}

/**
 * Wait for async rendering (tree-sitter highlighting etc.) to stabilize.
 * Returns when no render requests for stabilizeMs milliseconds.
 */
async function waitForRenderStabilization(
  renderer: CliRenderer,
  renderOnce: () => Promise<void>,
  stabilizeMs: number = 500
): Promise<void> {
  let lastRenderTime = Date.now()
  const originalRequestRender = renderer.root.requestRender.bind(renderer.root)
  renderer.root.requestRender = function() {
    lastRenderTime = Date.now()
    originalRequestRender()
  }
  
  while (Date.now() - lastRenderTime < stabilizeMs) {
    await new Promise(resolve => setTimeout(resolve, 100))
    await renderOnce()
  }
}

/**
 * Render diff to CapturedFrame using opentui test renderer.
 * Uses content-fitting: renders with initial height, measures actual content,
 * then resizes to exact content height to avoid wasting memory.
 */
export async function renderDiffToFrame(
  diffContent: string,
  options: CaptureOptions
): Promise<CapturedFrame> {
  const { createTestRenderer } = await import("@opentui/core/testing")
  const { createRoot } = await import("@opentui/react")
  const React = await import("react")
  const { parsePatch, formatPatch } = await import("diff")
  
  const { DiffView } = await import("./components/index.ts")
  const {
    getFileName,
    getOldFileName,
    countChanges,
    getViewMode,
    processFiles,
    detectFiletype,
    stripSubmoduleHeaders,
    parseGitDiffFiles,
  } = await import("./diff-utils.ts")
  const { themeNames, defaultThemeName } = await import("./themes.ts")

  const themeName = options.themeName && themeNames.includes(options.themeName)
    ? options.themeName
    : defaultThemeName

  // Parse the diff (with rename detection support)
  const files = parseGitDiffFiles(stripSubmoduleHeaders(diffContent), parsePatch)
  const filesWithRawDiff = processFiles(files, formatPatch)

  if (filesWithRawDiff.length === 0) {
    throw new Error("No files to display")
  }

  // Get theme colors
  const webTheme = getResolvedTheme(themeName)
  const webBg = webTheme.background
  const webText = rgbaToHex(webTheme.text)
  const webMuted = rgbaToHex(webTheme.textMuted)

  const showExpiryNotice = shouldShowExpiryNotice()

  // Create the diff view component
  // NOTE: No height: "100%" - let content determine its natural height
  function WebApp() {
    return React.createElement(
      "box",
      {
        style: {
          flexDirection: "column",
          backgroundColor: webBg,
        },
      },
      showExpiryNotice
        ? renderExpiryNotice({
            textColor: webText,
            mutedColor: webMuted,
          })
        : null,
      filesWithRawDiff.map((file, idx) => {
        const fileName = getFileName(file)
        const oldFileName = getOldFileName(file)
        const filetype = detectFiletype(fileName)
        const { additions, deletions } = countChanges(file.hunks)
        // Use higher threshold (150) for web rendering vs TUI (100)
        const viewMode = getViewMode(additions, deletions, options.cols, 150)

        // Build file header elements - show "old → new" for renames
        const fileHeaderChildren = oldFileName
          ? [
              React.createElement("text", { fg: webMuted, key: "old" }, oldFileName.trim()),
              React.createElement("text", { fg: webMuted, key: "arrow" }, " → "),
              React.createElement("text", { fg: webText, key: "new" }, fileName.trim()),
            ]
          : [React.createElement("text", { fg: webText, key: "name" }, fileName.trim())]

        return React.createElement(
          "box",
          { key: idx, style: { flexDirection: "column", marginBottom: 2 } },
          React.createElement(
            "box",
            {
              style: {
                paddingBottom: 1,
                paddingLeft: 1,
                paddingRight: 1,
                flexShrink: 0,
                flexDirection: "row",
                alignItems: "center",
              },
            },
            ...fileHeaderChildren,
            React.createElement("text", { fg: "#2d8a47" }, ` +${additions}`),
            React.createElement("text", { fg: "#c53b53" }, `-${deletions}`)
          ),
          React.createElement(DiffView, {
            diff: file.rawDiff || "",
            view: viewMode,
            filetype,
            themeName,
            ...(options.wrapMode && { wrapMode: options.wrapMode }),
          })
        )
      })
    )
  }

  // Content-fitting rendering:
  // 1. Start with small initial height
  // 2. If content is clipped (content height == buffer height), double the buffer
  // 3. Repeat until content fits or we hit max
  // 4. Shrink to exact content height
  
  let currentHeight = 100 // Start small
  
  const { renderer, renderOnce, resize } = await createTestRenderer({
    width: options.cols,
    height: currentHeight,
  })

  // Mount and do initial render
  createRoot(renderer).render(React.createElement(WebApp))
  await renderOnce()
  
  // Measure content height - layout is synchronous, no wait needed for sizing
  let contentHeight = getContentHeight(renderer.root)
  
  // If content height == buffer height, content is clipped - double until it fits
  while (contentHeight >= currentHeight && currentHeight < options.maxRows) {
    currentHeight = Math.min(currentHeight * 2, options.maxRows)
    resize(options.cols, currentHeight)
    await renderOnce()
    contentHeight = getContentHeight(renderer.root)
  }
  
  // Shrink to exact content height (remove empty space at bottom)
  const finalHeight = Math.min(Math.max(contentHeight, 1), options.maxRows)
  if (finalHeight < renderer.height) {
    resize(options.cols, finalHeight)
    await renderOnce()
  }
  
  // Wait for async highlighting to complete (only once at the end)
  await waitForRenderStabilization(renderer, renderOnce)

  // Capture the final frame
  const buffer = renderer.currentRenderBuffer
  const cursorState = renderer.getCursorState()
  const frame: CapturedFrame = {
    cols: buffer.width,
    rows: buffer.height,
    cursor: [cursorState.x, cursorState.y],
    lines: buffer.getSpanLines(),
  }
  
  renderer.destroy()
  return frame
}

/**
 * Capture diff and convert to HTML using test renderer
 */
export async function captureToHtml(
  diffContent: string,
  options: CaptureOptions
): Promise<string> {
  const { frameToHtmlDocument } = await import("./ansi-html.ts")

  // Render diff to captured frame
  const frame = await renderDiffToFrame(diffContent, options)

  // Get theme colors for HTML output
  const theme = getResolvedTheme(options.themeName)
  const backgroundColor = rgbaToHex(theme.background)
  const textColor = rgbaToHex(theme.text)

  // Check if theme was explicitly set (not default)
  const { themeNames, defaultThemeName } = await import("./themes.ts")
  const customTheme = options.themeName !== defaultThemeName && themeNames.includes(options.themeName)

  return frameToHtmlDocument(frame, {
    backgroundColor,
    textColor,
    autoTheme: !customTheme,
    title: options.title,
  })
}

/**
 * Generate desktop and mobile HTML versions in parallel, with optional OG image
 */
export async function captureResponsiveHtml(
  diffContent: string,
  options: {
    desktopCols: number
    mobileCols: number
    baseRows: number
    themeName: string
    title?: string
  }
): Promise<{ htmlDesktop: string; htmlMobile: string; ogImage: Buffer | null }> {
  // Max row values - content-fitting will grow to actual content size
  // These act as upper bounds to prevent runaway memory usage
  const desktopRows = Math.max(options.baseRows * 3, 5000)
  const mobileRows = Math.max(Math.ceil(desktopRows * (options.desktopCols / options.mobileCols)), 10000)

  // Try to generate OG image (takumi is optional)
  let ogImage: Buffer | null = null
  try {
    const { renderDiffToOgImage } = await import("./image.ts")
    ogImage = await renderDiffToOgImage(diffContent, {
      // Always use github-light for OG images (no dark mode support in OG protocol)
      themeName: "github-light",
    })
  } catch (e) {
    // takumi not installed or error - skip OG image
    ogImage = null
  }

  const [htmlDesktop, htmlMobile] = await Promise.all([
    captureToHtml(diffContent, {
      cols: options.desktopCols,
      maxRows: desktopRows,
      themeName: options.themeName,
      title: options.title,
    }),
    captureToHtml(diffContent, {
      cols: options.mobileCols,
      maxRows: mobileRows,
      themeName: options.themeName,
      title: options.title,
    }),
  ])

  return { htmlDesktop, htmlMobile, ogImage }
}

export interface ReviewRenderOptions extends CaptureOptions {
  hunks: IndexedHunk[]
  reviewData: ReviewYaml | null
}

/**
 * Render review to CapturedFrame using opentui test renderer.
 * Uses content-fitting: renders with initial height, measures actual content,
 * then resizes to exact content height to avoid wasting memory.
 */
export async function renderReviewToFrame(
  options: ReviewRenderOptions
): Promise<CapturedFrame> {
  const { createTestRenderer } = await import("@opentui/core/testing")
  const { createRoot } = await import("@opentui/react")
  const React = await import("react")
  
  const { ReviewAppView } = await import("./review/review-app.tsx")
  const { themeNames, defaultThemeName } = await import("./themes.ts")

  const themeName = options.themeName && themeNames.includes(options.themeName)
    ? options.themeName
    : defaultThemeName

  const theme = getResolvedTheme(themeName)
  const webBg = theme.background
  const webText = rgbaToHex(theme.text)
  const webMuted = rgbaToHex(theme.textMuted)
  const showExpiryNotice = shouldShowExpiryNotice()

  // Content-fitting: start small, double if clipped, shrink to fit
  let currentHeight = 100
  
  const { renderer, renderOnce, resize } = await createTestRenderer({
    width: options.cols,
    height: currentHeight,
  })

  // Create the review view component
  // Pass renderer to enable custom renderNode (wrapMode: "none" for diagrams)
  // NOTE: No height: "100%" - let content determine its natural height
  function ReviewWebApp() {
    return React.createElement(
      "box",
      {
        style: {
          flexDirection: "column",
          backgroundColor: webBg,
        },
      },
      showExpiryNotice
        ? renderExpiryNotice({
            textColor: webText,
            mutedColor: webMuted,
          })
        : null,
      React.createElement(ReviewAppView, {
        hunks: options.hunks,
        reviewData: options.reviewData,
        isGenerating: false,
        themeName,
        width: options.cols,
        showFooter: false,
        renderer: renderer,
      })
    )
  }

  // Mount and do initial render
  createRoot(renderer).render(React.createElement(ReviewWebApp))
  await renderOnce()
  
  // Measure content height - layout is synchronous, no wait needed for sizing
  let contentHeight = getContentHeight(renderer.root)
  
  // If content height == buffer height, content is clipped - double until it fits
  while (contentHeight >= currentHeight && currentHeight < options.maxRows) {
    currentHeight = Math.min(currentHeight * 2, options.maxRows)
    resize(options.cols, currentHeight)
    await renderOnce()
    contentHeight = getContentHeight(renderer.root)
  }
  
  // Shrink to exact content height (remove empty space at bottom)
  const finalHeight = Math.min(Math.max(contentHeight, 1), options.maxRows)
  if (finalHeight < renderer.height) {
    resize(options.cols, finalHeight)
    await renderOnce()
  }
  
  // Wait for async highlighting to complete (only once at the end)
  await waitForRenderStabilization(renderer, renderOnce)

  // Capture the final frame
  const buffer = renderer.currentRenderBuffer
  const cursorState = renderer.getCursorState()
  const frame: CapturedFrame = {
    cols: buffer.width,
    rows: buffer.height,
    cursor: [cursorState.x, cursorState.y],
    lines: buffer.getSpanLines(),
  }
  
  renderer.destroy()
  return frame
}

/**
 * Capture review and convert to HTML using test renderer
 */
export async function captureReviewToHtml(
  options: ReviewRenderOptions
): Promise<string> {
  const { frameToHtmlDocument } = await import("./ansi-html.ts")

  // Render review to captured frame
  const frame = await renderReviewToFrame(options)

  // Get theme colors for HTML output
  const theme = getResolvedTheme(options.themeName)
  const backgroundColor = rgbaToHex(theme.background)
  const textColor = rgbaToHex(theme.text)

  // Check if theme was explicitly set (not default)
  const { themeNames, defaultThemeName } = await import("./themes.ts")
  const customTheme = options.themeName !== defaultThemeName && themeNames.includes(options.themeName)

  return frameToHtmlDocument(frame, {
    backgroundColor,
    textColor,
    autoTheme: !customTheme,
    title: options.title,
  })
}

/**
 * Generate desktop and mobile HTML versions for review in parallel
 */
export async function captureReviewResponsiveHtml(
  options: {
    hunks: IndexedHunk[]
    reviewData: ReviewYaml | null
    desktopCols: number
    mobileCols: number
    baseRows: number
    themeName: string
    title?: string
  }
): Promise<{ htmlDesktop: string; htmlMobile: string; ogImage: Buffer | null }> {
  // Max row values - content-fitting will grow to actual content size
  // These act as upper bounds to prevent runaway memory usage
  const desktopRows = Math.max(options.baseRows * 3, 5000)
  const mobileRows = Math.max(Math.ceil(desktopRows * (options.desktopCols / options.mobileCols)), 10000)

  // Generate OG image from first few hunks' raw diff
  let ogImage: Buffer | null = null
  try {
    const { renderDiffToOgImage } = await import("./image.ts")
    // Extract raw diff from hunks (they have rawDiff field)
    const diffContent = options.hunks
      .slice(0, 5) // Take first 5 hunks max
      .map((h) => h.rawDiff)
      .join("\n")
    if (diffContent) {
      ogImage = await renderDiffToOgImage(diffContent, {
        // Always use github-light for OG images (no dark mode support in OG protocol)
        themeName: "github-light",
      })
    }
  } catch (e) {
    // takumi not installed or error - skip OG image
    ogImage = null
  }

  const [htmlDesktop, htmlMobile] = await Promise.all([
    captureReviewToHtml({
      hunks: options.hunks,
      reviewData: options.reviewData,
      cols: options.desktopCols,
      maxRows: desktopRows,
      themeName: options.themeName,
      title: options.title,
    }),
    captureReviewToHtml({
      hunks: options.hunks,
      reviewData: options.reviewData,
      cols: options.mobileCols,
      maxRows: mobileRows,
      themeName: options.themeName,
      title: options.title,
    }),
  ])

  return { htmlDesktop, htmlMobile, ogImage }
}

/**
 * Upload HTML to the critique.work worker
 */
export async function uploadHtml(
  htmlDesktop: string,
  htmlMobile: string,
  ogImage?: Buffer | null
): Promise<UploadResult> {
  const body: Record<string, string> = { 
    html: htmlDesktop, 
    htmlMobile,
  }

  // Include OG image as base64 if provided
  if (ogImage) {
    body.ogImage = ogImage.toString("base64")
  }

  const licenseKey = loadStoredLicenseKey()
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (licenseKey) {
    headers["X-Critique-License"] = licenseKey
  }

  const response = await fetch(`${WORKER_URL}/upload`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Upload failed: ${error}`)
  }

  const result = (await response.json()) as {
    id: string
    url: string
    ogImageUrl?: string
    expiresInDays?: number | null
  }
  return result
}

/**
 * Open a URL in the default browser
 */
export async function openInBrowser(url: string): Promise<void> {
  const openCmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open"

  try {
    await execAsync(`${openCmd} "${url}"`)
  } catch {
    // Silent fail - user can copy URL manually
  }
}

/**
 * Write content to a temp file and return the path
 */
export function writeTempFile(content: string, prefix: string, ext: string): string {
  const filePath = join(tmpdir(), `${prefix}-${Date.now()}${ext}`)
  fs.writeFileSync(filePath, content)
  return filePath
}

/**
 * Clean up a temp file (ignores errors)
 */
export function cleanupTempFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath)
  } catch {
    // Ignore cleanup errors
  }
}
