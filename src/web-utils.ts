// Shared utilities for web preview generation
// Used by both `web` and `explain --web` commands

import { exec } from "child_process"
import { promisify } from "util"
import fs from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { getResolvedTheme, rgbaToHex } from "./themes.ts"

const execAsync = promisify(exec)

// Worker URL for uploading HTML previews
export const WORKER_URL = process.env.CRITIQUE_WORKER_URL || "https://critique.work"

export interface CaptureOptions {
  cols: number
  rows: number
  themeName: string
  title?: string
}

export interface UploadResult {
  url: string
  id: string
}

/**
 * Capture PTY output from a render command and convert to HTML
 *
 * Uses Bun.Terminal (built-in since Bun 1.3.5) for real PTY support.
 * This ensures apps that check isTTY work correctly and receive proper
 * terminal dimensions. We use TextDecoder with streaming mode to handle
 * UTF-8 properly across chunk boundaries.
 */
export async function captureToHtml(
  renderCommand: string[],
  options: CaptureOptions
): Promise<string> {
  const { ansiToHtmlDocument } = await import("./ansi-html.ts")

  // TextDecoder with streaming mode to handle UTF-8 across chunk boundaries
  // Without this, multi-byte characters (like box-drawing ─) that span chunks become �
  const decoder = new TextDecoder()
  let ansiOutput = ""

  // Use Bun.Terminal for real PTY support (available since Bun 1.3.5)
  const proc = Bun.spawn(["bun", ...renderCommand], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TERM: "xterm-256color",
    },
    terminal: {
      cols: options.cols,
      rows: options.rows,
      // data callback receives raw Uint8Array bytes
      data(terminal, data) {
        // Use streaming mode to buffer incomplete UTF-8 sequences
        ansiOutput += decoder.decode(data, { stream: true })
      },
    },
  })

  await proc.exited

  // Close the terminal and flush any remaining bytes in the decoder
  proc.terminal?.close()
  ansiOutput += decoder.decode()

  if (!ansiOutput.trim()) {
    throw new Error("No output captured")
  }

  // Strip terminal cleanup sequences that clear the screen
  const clearIdx = ansiOutput.lastIndexOf("\x1b[H\x1b[J")
  if (clearIdx > 0) {
    ansiOutput = ansiOutput.slice(0, clearIdx)
  }

  // Get theme colors for HTML output
  const theme = getResolvedTheme(options.themeName)
  const backgroundColor = rgbaToHex(theme.background)
  const textColor = rgbaToHex(theme.text)

  // Check if theme was explicitly set (not default)
  const { themeNames, defaultThemeName } = await import("./themes.ts")
  const customTheme = options.themeName !== defaultThemeName && themeNames.includes(options.themeName)

  return ansiToHtmlDocument(ansiOutput, {
    cols: options.cols,
    rows: options.rows,
    backgroundColor,
    textColor,
    autoTheme: !customTheme,
    title: options.title,
  })
}

/**
 * Generate desktop and mobile HTML versions in parallel
 */
export async function captureResponsiveHtml(
  renderCommand: string[],
  options: {
    desktopCols: number
    mobileCols: number
    baseRows: number
    themeName: string
    title?: string
  }
): Promise<{ htmlDesktop: string; htmlMobile: string }> {
  // Mobile needs more rows since lines wrap more with fewer columns
  const mobileRows = Math.ceil(options.baseRows * (options.desktopCols / options.mobileCols))

  const [htmlDesktop, htmlMobile] = await Promise.all([
    captureToHtml(
      [...renderCommand, "--cols", String(options.desktopCols), "--rows", String(options.baseRows)],
      { cols: options.desktopCols, rows: options.baseRows, themeName: options.themeName, title: options.title }
    ),
    captureToHtml(
      [...renderCommand, "--cols", String(options.mobileCols), "--rows", String(mobileRows)],
      { cols: options.mobileCols, rows: mobileRows, themeName: options.themeName, title: options.title }
    ),
  ])

  return { htmlDesktop, htmlMobile }
}

/**
 * Upload HTML to the critique.work worker
 */
export async function uploadHtml(
  htmlDesktop: string,
  htmlMobile: string
): Promise<UploadResult> {
  const response = await fetch(`${WORKER_URL}/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ html: htmlDesktop, htmlMobile }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Upload failed: ${error}`)
  }

  const result = (await response.json()) as { id: string; url: string }
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
