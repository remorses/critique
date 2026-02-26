// ANSI escape sequence output for terminal scrollback rendering.
// Detects terminal color capabilities and outputs appropriate escape codes.
// Falls back gracefully: truecolor → 256 → 16 → plain text.

import supportsColor from "supports-color"
import { TextAttributes, type RGBA } from "@opentuah/core"
import type { CapturedFrame, CapturedSpan, CapturedLine } from "@opentuah/core"

// Color support levels: 0=none, 1=16 colors, 2=256 colors, 3=truecolor
type ColorLevel = 0 | 1 | 2 | 3

/**
 * Detect terminal color support level.
 * Returns 0 for non-TTY (piped output) to output plain text.
 * Respects FORCE_COLOR and NO_COLOR environment variables.
 */
export function getColorLevel(): ColorLevel {
  // supports-color handles FORCE_COLOR, NO_COLOR, and TTY detection internally
  if (!supportsColor.stdout) return 0
  return supportsColor.stdout.level as ColorLevel
}

/**
 * Convert RGB (0-1 floats) to nearest 256-color palette index.
 * Uses the 6x6x6 color cube (indices 16-231) and grayscale ramp (232-255).
 */
function rgbTo256(r: number, g: number, b: number): number {
  // Convert 0-1 floats to 0-255
  const r8 = Math.round(r * 255)
  const g8 = Math.round(g * 255)
  const b8 = Math.round(b * 255)

  // Grayscale detection - if all channels are close
  if (Math.abs(r8 - g8) < 8 && Math.abs(g8 - b8) < 8) {
    const gray = (r8 + g8 + b8) / 3
    if (gray < 8) return 16 // Black
    if (gray > 248) return 231 // White
    // Grayscale ramp: 232-255 (24 shades)
    return Math.round((gray - 8) / 10) + 232
  }

  // 6x6x6 color cube: indices 16-231
  const ri = Math.round(r * 5)
  const gi = Math.round(g * 5)
  const bi = Math.round(b * 5)
  return 16 + 36 * ri + 6 * gi + bi
}

/**
 * Convert RGB (0-1 floats) to nearest 16-color ANSI index.
 * Returns 0-7 for normal colors, 8-15 for bright colors.
 */
function rgbTo16(r: number, g: number, b: number): number {
  // Determine brightness
  const brightness = (r + g + b) / 3
  const bright = brightness > 0.5 ? 8 : 0

  // Determine which channels are "on"
  const threshold = 0.33
  const rb = r > threshold ? 1 : 0
  const gb = g > threshold ? 2 : 0
  const bb = b > threshold ? 4 : 0

  return bright + rb + gb + bb
}

/**
 * Blend a color with the background based on alpha.
 * Terminals don't support alpha, so we pre-blend.
 */
function blendWithBackground(color: RGBA, bg: RGBA): [number, number, number] {
  const a = color.a
  return [
    color.r * a + bg.r * (1 - a),
    color.g * a + bg.g * (1 - a),
    color.b * a + bg.b * (1 - a),
  ]
}

/**
 * Convert a single span to ANSI escape sequences.
 */
export function spanToAnsi(
  span: CapturedSpan,
  level: ColorLevel,
  themeBg: RGBA
): string {
  // No colors - return plain text
  if (level === 0) return span.text

  const codes: string[] = []

  // Foreground color
  if (span.fg.a > 0.01) {
    const [r, g, b] = blendWithBackground(span.fg, themeBg)
    if (level === 3) {
      // Truecolor
      codes.push(`38;2;${Math.round(r * 255)};${Math.round(g * 255)};${Math.round(b * 255)}`)
    } else if (level === 2) {
      // 256 colors
      codes.push(`38;5;${rgbTo256(r, g, b)}`)
    } else {
      // 16 colors
      const idx = rgbTo16(r, g, b)
      codes.push(idx >= 8 ? `9${idx - 8}` : `3${idx}`)
    }
  }

  // Background color
  if (span.bg.a > 0.01) {
    const [r, g, b] = blendWithBackground(span.bg, themeBg)
    if (level === 3) {
      // Truecolor
      codes.push(`48;2;${Math.round(r * 255)};${Math.round(g * 255)};${Math.round(b * 255)}`)
    } else if (level === 2) {
      // 256 colors
      codes.push(`48;5;${rgbTo256(r, g, b)}`)
    } else {
      // 16 colors
      const idx = rgbTo16(r, g, b)
      codes.push(idx >= 8 ? `10${idx - 8}` : `4${idx}`)
    }
  }

  // Text attributes
  if (span.attributes & TextAttributes.BOLD) codes.push("1")
  if (span.attributes & TextAttributes.DIM) codes.push("2")
  if (span.attributes & TextAttributes.ITALIC) codes.push("3")
  if (span.attributes & TextAttributes.UNDERLINE) codes.push("4")
  if (span.attributes & TextAttributes.STRIKETHROUGH) codes.push("9")

  // If no styling, return plain text
  if (codes.length === 0) return span.text

  // Wrap text with ANSI codes and reset
  return `\x1b[${codes.join(";")}m${span.text}\x1b[0m`
}

/**
 * Check if a line is empty (no spans or only whitespace).
 */
function isLineEmpty(line: CapturedLine): boolean {
  if (line.spans.length === 0) return true
  return line.spans.every((span) => span.text.trim() === "")
}

/**
 * Convert a CapturedFrame to ANSI-formatted string for terminal output.
 * Trims empty lines from the end by default.
 */
export function frameToAnsi(
  frame: CapturedFrame,
  themeBg: RGBA,
  options: { trimEmptyLines?: boolean } = {}
): string {
  const { trimEmptyLines = true } = options
  const level = getColorLevel()

  let lines = frame.lines

  // Trim empty lines from the end
  if (trimEmptyLines) {
    while (lines.length > 0 && isLineEmpty(lines[lines.length - 1]!)) {
      lines = lines.slice(0, -1)
    }
  }

  // Convert each line to ANSI
  return lines
    .map((line) => line.spans.map((span) => spanToAnsi(span, level, themeBg)).join(""))
    .join("\n")
}
