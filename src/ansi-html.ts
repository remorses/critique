import { ptyToJson, StyleFlags, type TerminalData, type TerminalLine, type TerminalSpan } from "opentui-ansi-vt"

export interface AnsiToHtmlOptions {
  cols?: number
  rows?: number
  /** Background color for the container */
  backgroundColor?: string
  /** Font family for the output */
  fontFamily?: string
  /** Font size for the output */
  fontSize?: string
  /** Trim empty lines from the end */
  trimEmptyLines?: boolean
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Convert a single span to HTML
 */
function spanToHtml(span: TerminalSpan): string {
  const styles: string[] = []

  if (span.fg) {
    styles.push(`color:${span.fg}`)
  }
  if (span.bg) {
    styles.push(`background-color:${span.bg}`)
  }

  // Handle style flags
  if (span.flags & StyleFlags.BOLD) {
    styles.push("font-weight:bold")
  }
  if (span.flags & StyleFlags.ITALIC) {
    styles.push("font-style:italic")
  }
  if (span.flags & StyleFlags.UNDERLINE) {
    styles.push("text-decoration:underline")
  }
  if (span.flags & StyleFlags.STRIKETHROUGH) {
    styles.push("text-decoration:line-through")
  }
  if (span.flags & StyleFlags.FAINT) {
    styles.push("opacity:0.5")
  }

  const escapedText = escapeHtml(span.text)

  if (styles.length === 0) {
    return escapedText
  }

  return `<span style="${styles.join(";")}">${escapedText}</span>`
}

/**
 * Convert a single line to HTML
 */
function lineToHtml(line: TerminalLine): string {
  if (line.spans.length === 0) {
    return ""
  }
  return line.spans.map(spanToHtml).join("")
}

/**
 * Converts ANSI terminal output to styled HTML.
 * Uses ptyToJson for parsing and renders HTML line by line.
 */
export function ansiToHtml(input: string | Buffer, options: AnsiToHtmlOptions = {}): string {
  const { cols = 500, rows = 256, trimEmptyLines = true } = options

  const data = ptyToJson(input, { cols, rows })

  let lines = data.lines

  // Trim empty lines from the end
  if (trimEmptyLines) {
    while (lines.length > 0 && lines[lines.length - 1]!.spans.length === 0) {
      lines = lines.slice(0, -1)
    }
  }

  // Render each line as a div
  const htmlLines = lines.map((line, idx) => {
    const content = lineToHtml(line)
    // Use a div for each line to ensure proper line breaks
    return `<div class="line">${content || "&nbsp;"}</div>`
  })

  return htmlLines.join("\n")
}

/**
 * Generates a complete HTML document from ANSI input.
 * Includes proper styling for terminal output display.
 * Font size automatically adjusts to fit content within viewport.
 */
export function ansiToHtmlDocument(input: string | Buffer, options: AnsiToHtmlOptions = {}): string {
  const {
    cols = 500,
    backgroundColor = "#0f0f0f",
    fontFamily = "Monaco, Menlo, 'Ubuntu Mono', Consolas, monospace",
    fontSize = "14px",
  } = options

  const content = ansiToHtml(input, options)

  // Character width ratio for monospace fonts (ch unit / font-size)
  // Most monospace fonts have a ratio around 0.6
  const charWidthRatio = 0.6
  const padding = 32 // 16px padding on each side

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Critique Diff</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  height: 100%;
  background-color: ${backgroundColor};
  color: #c5c8c6;
  font-family: ${fontFamily};
  font-size: ${fontSize};
  line-height: 1.4;
}
#content {
  padding: 16px;
  overflow-x: auto;
}
.line {
  white-space: pre;
}
</style>
</head>
<body>
<div id="content">
${content}
</div>
<script>
(function() {
  const cols = ${cols};
  const charRatio = ${charWidthRatio};
  const padding = ${padding};
  const minFontSize = 8;
  const maxFontSize = 16;

  function adjustFontSize() {
    const viewportWidth = window.innerWidth;
    // Calculate font size to fit cols characters in viewport
    // cols * charRatio * fontSize = viewportWidth - padding
    const calculatedSize = (viewportWidth - padding) / (cols * charRatio);
    const fontSize = Math.max(minFontSize, Math.min(maxFontSize, calculatedSize));
    document.body.style.fontSize = fontSize + 'px';
  }

  adjustFontSize();
  window.addEventListener('resize', adjustFontSize);
})();
</script>
</body>
</html>`
}

export type { TerminalData }
