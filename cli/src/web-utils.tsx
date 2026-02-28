// Web preview generation utilities for uploading diffs to critique.work.
// Renders diff components using opentui test renderer, converts to HTML with responsive layout,
// and uploads desktop/mobile versions for shareable diff viewing.

import { exec } from "child_process"
import { promisify } from "util"
import fs from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { getResolvedTheme, rgbaToHex } from "./themes.js"
import type { BoxRenderable, CapturedFrame, CapturedLine, RootRenderable, CliRenderer } from "@opentuah/core"
import type { IndexedHunk, ReviewYaml } from "./review/types.js"
import { loadStoredLicenseKey, loadOrCreateOwnerSecret } from "./license.js"

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
  /** Force split or unified view mode, bypassing auto-detection */
  viewMode?: "split" | "unified"
  /** Show privacy/expiry notice block at top (default: false, enabled for web uploads) */
  showNotice?: boolean
}

export interface UploadResult {
  url: string
  id: string
  ogImageUrl?: string
  expiresInDays?: number | null
}

function renderNoticeBlock(options: {
  mutedColor: string
  showExpiry: boolean
}) {
  const buyUrl = `${WORKER_URL}/buy`
  return (
    <box style={{ flexDirection: "column", paddingBottom: 1, paddingLeft: 1 }}>
      <box style={{ flexDirection: "row" }}>
        <text fg={options.mutedColor}>This URL is private - only people with the link can access it.</text>
      </box>
      <box style={{ flexDirection: "row" }}>
        <text fg={options.mutedColor}>Use </text>
        <text fg={options.mutedColor}>critique unpublish {"<url>"}</text>
        <text fg={options.mutedColor}> to delete.</text>
      </box>
      {options.showExpiry ? (
        <box style={{ flexDirection: "row" }}>
          <text fg={options.mutedColor}>This page will expire in 7 days. </text>
          <text fg={options.mutedColor}>Get unlimited links: </text>
          <text fg={options.mutedColor}>{buyUrl}</text>
        </box>
      ) : null}
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

interface FileSectionPosition {
  lineIndex: number
  fileName: string
}

interface RenderDiffFrameResult {
  frame: CapturedFrame
  sectionPositions: FileSectionPosition[]
}

/**
 * Render diff to CapturedFrame using opentui test renderer.
 * Uses content-fitting: renders with initial height, measures actual content,
 * then resizes to exact content height to avoid wasting memory.
 */
async function renderDiffToFrameWithSectionPositions(
  diffContent: string,
  options: CaptureOptions,
): Promise<RenderDiffFrameResult> {
  const { createTestRenderer } = await import("@opentuah/core/testing")
  const { createRoot } = await import("@opentuah/react")
  const { getTreeSitterClient } = await import("@opentuah/core")
  const React = await import("react")
  const { parsePatch, formatPatch } = await import("diff")
  
  // Pre-initialize TreeSitter client to ensure syntax highlighting works
  const tsClient = getTreeSitterClient()
  await tsClient.initialize()
  
  const { DiffView } = await import("./components/index.js")
  const {
    getFileName,
    getOldFileName,
    countChanges,
    getViewMode,
    processFiles,
    detectFiletype,
    stripSubmoduleHeaders,
    parseGitDiffFiles,
  } = await import("./diff-utils.js")
  const { themeNames, defaultThemeName } = await import("./themes.js")

  const themeName = options.themeName && themeNames.includes(options.themeName)
    ? options.themeName
    : defaultThemeName

  // Parse the diff (with rename detection support)
  const files = parseGitDiffFiles(stripSubmoduleHeaders(diffContent), parsePatch)
  const filesWithRawDiff = processFiles(files, formatPatch)
  const fileNames = filesWithRawDiff.map((file) => getFileName(file))

  if (filesWithRawDiff.length === 0) {
    throw new Error("No files to display")
  }

  // Store refs to each file section container so we can map file headers
  // to exact rendered line indexes (avoids text-regex false positives).
  const fileSectionRefs = new Map<number, BoxRenderable>()

  // Get theme colors
  const webTheme = getResolvedTheme(themeName)
  const webBg = webTheme.background
  const webText = rgbaToHex(webTheme.text)
  const webMuted = rgbaToHex(webTheme.textMuted)

  const showExpiryNotice = shouldShowExpiryNotice()
  const showNotice = options.showNotice === true

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
      showNotice
        ? renderNoticeBlock({
            mutedColor: webMuted,
            showExpiry: showExpiryNotice,
          })
        : null,
      filesWithRawDiff.map((file, idx) => {
        const fileName = getFileName(file)
        const oldFileName = getOldFileName(file)
        const filetype = detectFiletype(fileName)
        const { additions, deletions } = countChanges(file.hunks)
        // Use forced viewMode if set, otherwise auto-detect (higher threshold 150 for web vs TUI 100)
        const viewMode = options.viewMode || getViewMode(additions, deletions, options.cols, 150)

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
          {
            key: idx,
            ref: (r: BoxRenderable | null) => {
              if (r) fileSectionRefs.set(idx, r)
              else fileSectionRefs.delete(idx)
            },
            style: { flexDirection: "column", marginBottom: 2 },
          },
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
  
  // Wait for React to mount components (may take a few render cycles)
  let contentHeight = getContentHeight(renderer.root)
  while (contentHeight === 0) {
    await new Promise(resolve => setTimeout(resolve, 10))
    await renderOnce()
    contentHeight = getContentHeight(renderer.root)
  }
  
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

  const sectionPositions: FileSectionPosition[] = []
  for (let idx = 0; idx < fileNames.length; idx++) {
    const section = fileSectionRefs.get(idx)
    if (!section) continue

    const layout = section.getLayoutNode().getComputedLayout()
    sectionPositions.push({
      lineIndex: Math.max(0, Math.round(layout.top)),
      fileName: fileNames[idx]!,
    })
  }

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
  return {
    frame,
    sectionPositions,
  }
}

export async function renderDiffToFrame(
  diffContent: string,
  options: CaptureOptions,
): Promise<CapturedFrame> {
  const { frame } = await renderDiffToFrameWithSectionPositions(diffContent, options)
  return frame
}

/**
 * Convert a file path to a URL-safe anchor slug.
 * e.g. "src/components/foo-bar.tsx" → "src-components-foo-bar-tsx"
 */
export function slugifyFileName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/**
 * Return a unique ID, appending -2, -3, etc. if the base already exists.
 */
function dedupeId(id: string, usedIds: Set<string>): string {
  if (!usedIds.has(id)) return id
  let i = 2
  while (usedIds.has(`${id}-${i}`)) i++
  return `${id}-${i}`
}

/**
 * Extract the first line number from a captured diff line's spans.
 * Diff lines start with spans like: " " "26" "   " — the line number
 * is the first span whose trimmed text is purely numeric.
 * Returns the number string or null if no line number found.
 */
function extractLineNumber(line: CapturedLine): string | null {
  for (const span of line.spans) {
    const trimmed = span.text.trim()
    if (trimmed === "") continue
    // First non-empty span: if it's a number, that's the line number
    if (/^\d+$/.test(trimmed)) return trimmed
    // Otherwise this line doesn't start with a line number (e.g. header, hunk marker)
    return null
  }
  return null
}

/**
 * Build line-indexed anchors from file section layout positions.
 * This avoids regex detection on rendered text, which can produce
 * false positives when code lines mimic file-header patterns.
 */
export function buildAnchorMap(
  sections: Array<{ lineIndex: number; fileName: string }>,
): Map<number, { id: string; label: string }> {
  const anchors = new Map<number, { id: string; label: string }>()
  const usedIds = new Set<string>()

  for (const section of sections) {
    if (!Number.isFinite(section.lineIndex) || section.lineIndex < 0) continue
    if (anchors.has(section.lineIndex)) continue

    const label = section.fileName.trim()
    const baseSlug = slugifyFileName(label) || "file"
    const id = dedupeId(baseSlug, usedIds)
    usedIds.add(id)
    anchors.set(section.lineIndex, { id, label })
  }

  return anchors
}

// CSS for file section anchors — injected via extraCss hook
const SECTION_ANCHOR_CSS =
  `.file-section{scroll-margin-top:16px;}` +
  `.file-link{color:inherit;text-decoration:none;cursor:pointer;}` +
  `.file-link:hover{text-decoration:underline;}`

// JS to scroll to hash fragment on page load — injected via extraJs hook
const SECTION_ANCHOR_JS =
  `if(location.hash){var el=document.getElementById(location.hash.slice(1));if(el)setTimeout(function(){el.scrollIntoView({behavior:'smooth'})},100);}`

/**
 * Capture diff and convert to HTML using test renderer
 */
export async function captureToHtml(
  diffContent: string,
  options: CaptureOptions
): Promise<string> {
  const { frameToHtmlDocument } = await import("./ansi-html.js")

  // Render diff to captured frame (with notice for web uploads)
  // and collect exact section line positions from layout metadata.
  const { frame, sectionPositions } = await renderDiffToFrameWithSectionPositions(
    diffContent,
    { ...options, showNotice: true },
  )
  const anchors = buildAnchorMap(sectionPositions)

  // Get theme colors for HTML output
  const theme = getResolvedTheme(options.themeName)
  const backgroundColor = rgbaToHex(theme.background)
  const textColor = rgbaToHex(theme.text)

  // Check if theme was explicitly set (not default)
  const { themeNames, defaultThemeName } = await import("./themes.js")
  const customTheme = options.themeName !== defaultThemeName && themeNames.includes(options.themeName)

  // Build renderLine callback that:
  // 1. Wraps file header lines with anchor IDs and clickable links
  // 2. Adds data-anchor="file:line" on diff lines so the agentation widget
  //    can capture which exact diff line an annotation refers to
  //
  // sectionPositions is sorted by lineIndex (ascending). We track currentFile
  // by advancing a pointer as we iterate lines.
  const sortedSections = [...sectionPositions].sort((a, b) => a.lineIndex - b.lineIndex)
  let sectionPtr = 0
  let currentFile: string | null = null

  const renderLineCallback = (defaultHtml: string, line: CapturedLine, lineIndex: number) => {
    // Advance current file when we pass a section boundary
    while (sectionPtr < sortedSections.length && lineIndex >= sortedSections[sectionPtr]!.lineIndex) {
      currentFile = sortedSections[sectionPtr]!.fileName
      sectionPtr++
    }

    let html = defaultHtml

    // File-section header: add id + clickable link
    const anchor = anchors.get(lineIndex)
    if (anchor) {
      html = html.replace(
        '<div class="line">',
        `<div id="${anchor.id}" class="line file-section">`,
      )
      const escapedLabel = anchor.label
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
      html = html.replace(
        `>${escapedLabel}</span>`,
        `><a href="#${anchor.id}" class="file-link">${escapedLabel}</a></span>`,
      )
    }

    // Diff line: extract line number from spans and add data-anchor.
    // Diff lines start with spans like: " " "26" " " — the line number
    // is the first span whose trimmed text is purely numeric.
    if (currentFile && !anchor) {
      const lineNum = extractLineNumber(line)
      if (lineNum) {
        const basename = currentFile.split("/").pop() || currentFile
        const anchorValue = `${basename}:${lineNum}`
        html = html.replace(
          '<div class="line">',
          `<div class="line" data-anchor="${anchorValue}">`,
        )
      }
    }

    return html
  }

  return frameToHtmlDocument(frame, {
    backgroundColor,
    textColor,
    autoTheme: !customTheme,
    title: options.title,
    renderLine: renderLineCallback,
    extraCss: anchors.size > 0 ? SECTION_ANCHOR_CSS : undefined,
    extraJs: anchors.size > 0 ? SECTION_ANCHOR_JS : undefined,
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
    const { renderDiffToOgImage } = await import("./image.js")
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
  const { createTestRenderer } = await import("@opentuah/core/testing")
  const { createRoot } = await import("@opentuah/react")
  const { getTreeSitterClient } = await import("@opentuah/core")
  const React = await import("react")
  
  // Pre-initialize TreeSitter client to ensure syntax highlighting works
  const tsClient = getTreeSitterClient()
  await tsClient.initialize()
  
  const { ReviewAppView } = await import("./review/review-app.js")
  const { themeNames, defaultThemeName } = await import("./themes.js")

  const themeName = options.themeName && themeNames.includes(options.themeName)
    ? options.themeName
    : defaultThemeName

  const theme = getResolvedTheme(themeName)
  const webBg = theme.background
  const webText = rgbaToHex(theme.text)
  const webMuted = rgbaToHex(theme.textMuted)
  const showExpiryNotice = shouldShowExpiryNotice()
  const showNotice = options.showNotice === true

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
      showNotice
        ? renderNoticeBlock({
            mutedColor: webMuted,
            showExpiry: showExpiryNotice,
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
  
  // Wait for React to mount components (may take a few render cycles)
  let contentHeight = getContentHeight(renderer.root)
  while (contentHeight === 0) {
    await new Promise(resolve => setTimeout(resolve, 10))
    await renderOnce()
    contentHeight = getContentHeight(renderer.root)
  }
  
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
  const { frameToHtmlDocument } = await import("./ansi-html.js")

  // Render review to captured frame (with notice for web uploads)
  const frame = await renderReviewToFrame({ ...options, showNotice: true })

  // Get theme colors for HTML output
  const theme = getResolvedTheme(options.themeName)
  const backgroundColor = rgbaToHex(theme.background)
  const textColor = rgbaToHex(theme.text)

  // Check if theme was explicitly set (not default)
  const { themeNames, defaultThemeName } = await import("./themes.js")
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
    const { renderDiffToOgImage } = await import("./image.js")
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
  const ownerSecret = loadOrCreateOwnerSecret()
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Critique-Owner-Secret": ownerSecret,
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

export interface DeleteResult {
  success: boolean
  message: string
}

/**
 * Extract diff ID from URL or raw ID string.
 * Supports: https://critique.work/v/abc123, critique.work/v/abc123, /v/abc123, abc123
 */
export function extractDiffId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim()
  
  // Try to extract from URL path
  const urlMatch = trimmed.match(/\/v\/([a-f0-9]{16,32})(?:\?|$|#)?/i)
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1].toLowerCase()
  }
  
  // Check if it's a raw hex ID
  if (/^[a-f0-9]{16,32}$/i.test(trimmed)) {
    return trimmed.toLowerCase()
  }
  
  return null
}

/**
 * Delete a published diff by URL or ID.
 * Requires the owner secret to match what was stored on upload.
 */
export async function deleteUpload(urlOrId: string): Promise<DeleteResult> {
  const id = extractDiffId(urlOrId)
  if (!id) {
    return {
      success: false,
      message: "Invalid URL or ID format. Expected a critique.work URL or 16-32 character hex ID.",
    }
  }

  const ownerSecret = loadOrCreateOwnerSecret()
  
  const response = await fetch(`${WORKER_URL}/v/${id}`, {
    method: "DELETE",
    headers: {
      "X-Critique-Owner-Secret": ownerSecret,
    },
  })

  if (response.ok) {
    return {
      success: true,
      message: "Diff deleted successfully.",
    }
  }

  const result = await response.json().catch(() => ({ error: "Unknown error" })) as { error?: string }
  return {
    success: false,
    message: result.error || `Failed to delete (${response.status})`,
  }
}
