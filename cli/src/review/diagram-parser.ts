// ASCII/Unicode diagram parser for syntax highlighting in markdown code blocks.
// Separates structural characters (box-drawing, arrows) from text content
// to render diagrams with muted structural elements and highlighted labels.

/**
 * A segment of text with a specific color type
 */
export interface DiagramSegment {
  text: string
  type: "text" | "muted"
}

/**
 * A parsed line of diagram content
 */
export interface ParsedDiagramLine {
  segments: DiagramSegment[]
}

// Box drawing characters (Unicode)
const BOX_DRAWING_CHARS = new Set([
  // Light box drawing
  "┌",
  "┐",
  "└",
  "┘",
  "─",
  "│",
  "├",
  "┤",
  "┬",
  "┴",
  "┼",
  // Double box drawing
  "╔",
  "╗",
  "╚",
  "╝",
  "═",
  "║",
  "╠",
  "╣",
  "╦",
  "╩",
  "╬",
  // Heavy box drawing
  "┏",
  "┓",
  "┗",
  "┛",
  "━",
  "┃",
  "┣",
  "┫",
  "┳",
  "┻",
  "╋",
  // Mixed light/heavy
  "┍",
  "┎",
  "┑",
  "┒",
  "┕",
  "┖",
  "┙",
  "┚",
  "┝",
  "┞",
  "┟",
  "┠",
  "┡",
  "┢",
  "┥",
  "┦",
  "┧",
  "┨",
  "┩",
  "┪",
  "┭",
  "┮",
  "┯",
  "┰",
  "┱",
  "┲",
  "┵",
  "┶",
  "┷",
  "┸",
  "┹",
  "┺",
  "┽",
  "┾",
  "┿",
  "╀",
  "╁",
  "╂",
  "╃",
  "╄",
  "╅",
  "╆",
  "╇",
  "╈",
  "╉",
  "╊",
  // Rounded corners
  "╭",
  "╮",
  "╯",
  "╰",
])

// Arrow characters
const ARROW_CHARS = new Set([
  // Unicode arrows
  "▶",
  "◀",
  "▼",
  "▲",
  "►",
  "◄",
  "▾",
  "▴",
  "→",
  "←",
  "↓",
  "↑",
  "↔",
  "↕",
  "↖",
  "↗",
  "↘",
  "↙",
  "⇒",
  "⇐",
  "⇓",
  "⇑",
  "⇔",
  "⇕",
  // Triangle arrows
  "△",
  "▽",
  "◁",
  "▷",
  "⊳",
  "⊲",
  "⊴",
  "⊵",
])

// ASCII diagram characters (structural, not text)
// Note: "v" and "V" are NOT included because they appear in regular text
// like "Server", "Validate", etc.
const ASCII_STRUCTURAL_CHARS = new Set(["-", "|", "+", "/", "\\", "<", ">", "^"])

/**
 * Check if a character is a diagram structural character (should be muted)
 */
function isDiagramChar(char: string): boolean {
  return (
    BOX_DRAWING_CHARS.has(char) ||
    ARROW_CHARS.has(char) ||
    ASCII_STRUCTURAL_CHARS.has(char)
  )
}

/**
 * Parse a single line of diagram content into segments
 */
export function parseDiagramLine(line: string): ParsedDiagramLine {
  if (!line) {
    return { segments: [] }
  }

  const segments: DiagramSegment[] = []
  let currentText = ""
  let currentType: "text" | "muted" | null = null

  // Iterate through each character (handling Unicode properly)
  for (const char of line) {
    const isMuted = isDiagramChar(char) || char === " "
    const type = isMuted ? "muted" : "text"

    if (currentType === null) {
      currentType = type
      currentText = char
    } else if (type === currentType) {
      currentText += char
    } else {
      // Type changed, push current segment and start new one
      segments.push({ text: currentText, type: currentType })
      currentText = char
      currentType = type
    }
  }

  // Push final segment
  if (currentText && currentType !== null) {
    segments.push({ text: currentText, type: currentType })
  }

  return { segments }
}

/**
 * Parse entire diagram content into lines of segments
 */
export function parseDiagram(content: string): ParsedDiagramLine[] {
  const lines = content.split("\n")
  return lines.map(parseDiagramLine)
}

/**
 * Convert parsed diagram to a debug string for testing
 * Muted segments are replaced with '*' characters
 */
export function diagramToDebugString(parsed: ParsedDiagramLine[]): string {
  return parsed
    .map((line) => {
      return line.segments
        .map((segment) => {
          if (segment.type === "muted") {
            // Replace each character with '*' to show what would be muted
            return "*".repeat([...segment.text].length)
          }
          return segment.text
        })
        .join("")
    })
    .join("\n")
}

/**
 * Convert ASCII diagram characters to Unicode box-drawing equivalents.
 * Eliminates visual gaps between lines.
 * - `|` → `│` (vertical lines)
 * - `--` or more → `──` (horizontal lines, but not single hyphens in text)
 */
export function convertAsciiToUnicode(content: string): string {
  return content
    .replace(/\|/g, "│")
    .replace(/-{2,}/g, match => "─".repeat(match.length))
}
