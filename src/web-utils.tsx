// Web preview generation utilities for uploading diffs to critique.work.
// Renders diff components using opentui test renderer, converts to HTML with responsive layout,
// and uploads desktop/mobile versions for shareable diff viewing.

import { exec } from "child_process"
import { promisify } from "util"
import fs from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { getResolvedTheme, rgbaToHex } from "./themes.ts"
import { RGBA, type CapturedFrame, type CapturedLine, type CapturedSpan } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { loadStoredLicenseKey } from "./license.ts"

const execAsync = promisify(exec)

function safeCaptureSpans(renderer: CliRenderer): CapturedFrame {
  const buffer = renderer.currentRenderBuffer
  const { char, fg, bg, attributes } = buffer.buffers
  const width = buffer.width
  const height = buffer.height

  const CHAR_FLAG_CONTINUATION = 0xc0000000 | 0
  const CHAR_FLAG_MASK = 0xc0000000 | 0

  const realTextBytes = buffer.getRealCharBytes(true)
  const realTextLines = new TextDecoder().decode(realTextBytes).split("\n")

  const lines: CapturedLine[] = []

  for (let y = 0; y < height; y++) {
    const spans: CapturedSpan[] = []
    let currentSpan: CapturedSpan | null = null

    const lineChars = [...(realTextLines[y] || "")]
    let charIdx = 0

    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const cp = char[i]!
      const cellFg = RGBA.fromValues(fg[i * 4]!, fg[i * 4 + 1]!, fg[i * 4 + 2]!, fg[i * 4 + 3]!)
      const cellBg = RGBA.fromValues(bg[i * 4]!, bg[i * 4 + 1]!, bg[i * 4 + 2]!, bg[i * 4 + 3]!)
      const cellAttrs = attributes[i]! & 0xff

      // Continuation cells are placeholders for wide characters (emojis, CJK)
      const isContinuation = (cp & CHAR_FLAG_MASK) === CHAR_FLAG_CONTINUATION
      const cellChar = isContinuation ? "" : (lineChars[charIdx++] ?? " ")

      if (
        currentSpan &&
        currentSpan.fg.equals(cellFg) &&
        currentSpan.bg.equals(cellBg) &&
        currentSpan.attributes === cellAttrs
      ) {
        currentSpan.text += cellChar
        currentSpan.width += 1
      } else {
        if (currentSpan) {
          spans.push(currentSpan)
        }
        currentSpan = {
          text: cellChar,
          fg: cellFg,
          bg: cellBg,
          attributes: cellAttrs,
          width: 1,
        }
      }
    }

    if (currentSpan) {
      spans.push(currentSpan)
    }

    lines.push({ spans })
  }

  const cursorState = renderer.getCursorState()
  return {
    cols: width,
    rows: height,
    cursor: [cursorState.x, cursorState.y] as [number, number],
    lines,
  }
}

// Worker URL for uploading HTML previews
export const WORKER_URL = process.env.CRITIQUE_WORKER_URL || "https://critique.work"

export interface CaptureOptions {
  cols: number
  rows: number
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
 * Render diff to CapturedFrame using opentui test renderer.
 * This replaces the subprocess + ANSI capture approach.
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

  // Create test renderer
  const { renderer, renderOnce } = await createTestRenderer({
    width: options.cols,
    height: options.rows,
  })

  // Get theme colors
  const webTheme = getResolvedTheme(themeName)
  const webBg = webTheme.background
  const webText = rgbaToHex(webTheme.text)
  const webMuted = rgbaToHex(webTheme.textMuted)

  const showExpiryNotice = shouldShowExpiryNotice()

  // Create the diff view component
  function WebApp() {
    return React.createElement(
      "box",
      {
        style: {
          flexDirection: "column",
          height: "100%",
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

  // Render the component
  createRoot(renderer).render(React.createElement(WebApp))

  // Wait for syntax highlighting to complete
  // The diff component uses async tree-sitter highlighting
  await renderOnce()
  
  // Give tree-sitter time to complete async highlighting
  // Multiple render passes may be needed for all files
  let lastRenderTime = Date.now()
  const originalRequestRender = renderer.root.requestRender.bind(renderer.root)
  renderer.root.requestRender = function() {
    lastRenderTime = Date.now()
    originalRequestRender()
  }
  
  // Wait until no renders for 500ms (highlighting complete)
  while (Date.now() - lastRenderTime < 500) {
    await new Promise(resolve => setTimeout(resolve, 100))
    await renderOnce()
  }

  // Capture the final frame (using safe version that handles invalid codepoints)
  const frame = safeCaptureSpans(renderer)
  
  // Clean up
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
  // Use large row values to ensure all content fits without scrolling
  // The frameToHtml function trims empty lines at the end
  const desktopRows = Math.max(options.baseRows * 3, 1000)
  const mobileRows = Math.max(Math.ceil(desktopRows * (options.desktopCols / options.mobileCols)), 2000)

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
      rows: desktopRows,
      themeName: options.themeName,
      title: options.title,
    }),
    captureToHtml(diffContent, {
      cols: options.mobileCols,
      rows: mobileRows,
      themeName: options.themeName,
      title: options.title,
    }),
  ])

  return { htmlDesktop, htmlMobile, ogImage }
}

export interface ReviewRenderOptions extends CaptureOptions {
  hunks: any[]
  reviewData: any
}

/**
 * Render review to CapturedFrame using opentui test renderer.
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

  // Create test renderer
  const { renderer, renderOnce } = await createTestRenderer({
    width: options.cols,
    height: options.rows,
  })

  // Create the review view component
  // Pass renderer to enable custom renderNode (wrapMode: "none" for diagrams)
  function ReviewWebApp() {
    return React.createElement(
      "box",
      {
        style: {
          flexDirection: "column",
          height: "100%",
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

  // Render the component
  createRoot(renderer).render(React.createElement(ReviewWebApp))

  // Wait for syntax highlighting to complete
  await renderOnce()
  
  // Give tree-sitter time to complete async highlighting
  let lastRenderTime = Date.now()
  const originalRequestRender = renderer.root.requestRender.bind(renderer.root)
  renderer.root.requestRender = function() {
    lastRenderTime = Date.now()
    originalRequestRender()
  }
  
  // Wait until no renders for 500ms (highlighting complete)
  while (Date.now() - lastRenderTime < 500) {
    await new Promise(resolve => setTimeout(resolve, 100))
    await renderOnce()
  }

  // Capture the final frame (using safe version that handles invalid codepoints)
  const frame = safeCaptureSpans(renderer)
  
  // Clean up
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
    hunks: any[]
    reviewData: any
    desktopCols: number
    mobileCols: number
    baseRows: number
    themeName: string
    title?: string
  }
): Promise<{ htmlDesktop: string; htmlMobile: string; ogImage: Buffer | null }> {
  // Use large row values to ensure all content fits without scrolling
  // The frameToHtml function trims empty lines at the end
  const desktopRows = Math.max(options.baseRows * 3, 1000)
  const mobileRows = Math.max(Math.ceil(desktopRows * (options.desktopCols / options.mobileCols)), 2000)

  // Generate OG image from first few hunks' raw diff
  let ogImage: Buffer | null = null
  try {
    const { renderDiffToOgImage } = await import("./image.ts")
    // Extract raw diff from hunks (they have rawDiff field)
    const diffContent = options.hunks
      .slice(0, 5) // Take first 5 hunks max
      .map((h: any) => h.rawDiff)
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
      rows: desktopRows,
      themeName: options.themeName,
      title: options.title,
    }),
    captureReviewToHtml({
      hunks: options.hunks,
      reviewData: options.reviewData,
      cols: options.mobileCols,
      rows: mobileRows,
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
