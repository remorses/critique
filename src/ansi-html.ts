import { ptyToJson, StyleFlags, type TerminalData, type TerminalLine, type TerminalSpan } from "ghostty-opentui"

export interface AnsiToHtmlOptions {
  cols?: number
  rows?: number
  /** Background color for the container */
  backgroundColor?: string
  /** Text color for the container */
  textColor?: string
  /** Font family for the output */
  fontFamily?: string
  /** Font size for the output */
  fontSize?: string
  /** Trim empty lines from the end */
  trimEmptyLines?: boolean
  /** Enable auto light/dark mode based on system preference */
  autoTheme?: boolean
  /** HTML document title */
  title?: string
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
 * Always wraps in a span element so flex layout works properly
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
  
  // Always wrap in span for consistent flex behavior
  if (styles.length === 0) {
    return `<span>${escapedText}</span>`
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
 * Check if a line is empty (no spans or only whitespace content)
 */
function isLineEmpty(line: TerminalLine): boolean {
  if (line.spans.length === 0) return true
  // Check if all spans contain only whitespace
  return line.spans.every(span => span.text.trim() === "")
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
    while (lines.length > 0 && isLineEmpty(lines[lines.length - 1]!)) {
      lines = lines.slice(0, -1)
    }
  }

  // Render each line as a div
  const htmlLines = lines.map((line, idx) => {
    const content = lineToHtml(line)
    // Use a div for each line to ensure proper line breaks
    // Empty lines get a span with nbsp for consistent flex behavior
    return `<div class="line">${content || "<span>&nbsp;</span>"}</div>`
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
    backgroundColor = "#ffffff",
    textColor = "#1a1a1a",
    fontFamily = "Monaco, Menlo, 'Ubuntu Mono', Consolas, monospace",
    fontSize = "14px",
    title = "Critique Diff",
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
<title>${escapeHtml(title)}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
html, body {
  height: 100%;
  max-width: 100vw;
  overflow-x: hidden;
  background-color: ${backgroundColor};
  color: ${textColor};
  font-family: ${fontFamily};
  font-size: ${fontSize};
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
body {
  display: flex;
  justify-content: center;
}
#content {
  padding: 16px;
  overflow-x: auto;
  max-width: 100vw;
  box-sizing: border-box;
}
.line {
  white-space: pre;
  display: flex;
  content-visibility: auto;
  contain-intrinsic-block-size: auto 1.5em;
  background-color: ${backgroundColor};
  transform: translateZ(0);
  backface-visibility: hidden;
}
.line span {
  white-space: pre;
}
${options.autoTheme ? `@media (prefers-color-scheme: light) {
  html {
    filter: invert(1) hue-rotate(180deg);
  }
}` : ''}\nhtml{scrollbar-width:thin;scrollbar-color:#6b7280 #2d3748;}@media(prefers-color-scheme:light){html{scrollbar-color:#a0aec0 #edf2f7;}}::-webkit-scrollbar{width:12px;}::-webkit-scrollbar-track{background:#2d3748;}::-webkit-scrollbar-thumb{background:#6b7280;border-radius:6px;}::-webkit-scrollbar-thumb:hover{background:#a0aec0;}@media(prefers-color-scheme:light){::-webkit-scrollbar-track{background:#edf2f7;}::-webkit-scrollbar-thumb{background:#a0aec0;}::-webkit-scrollbar-thumb:hover{background:#cbd5e1;}}::-webkit-scrollbar {\n  width: 12px;\n}\n::-webkit-scrollbar-track {\n  background: #2d3748;\n}\n::-webkit-scrollbar-thumb {\n  background: #6b7280;\n  border-radius: 6px;\n}\n::-webkit-scrollbar-thumb:hover {\n  background: #a0aec0;\n}\n@media (prefers-color-scheme: light) {\n  ::-webkit-scrollbar-track {\n    background: #edf2f7;\n  }\n  ::-webkit-scrollbar-thumb {\n    background: #a0aec0;\n  }\n  ::-webkit-scrollbar-thumb:hover {\n    background: #cbd5e1;\n  }\n}\n</style>\n</head>\n<body>
<div id="content">
${content}
</div>
<script>
(function() {
  const cols = ${cols};
  const charRatio = ${charWidthRatio};
  const padding = ${padding};
  const minFontSize = 4;
  const maxFontSize = 14;

  // Redirect mobile devices to ?v=mobile for optimized view
  // Only redirect if not already on a forced version
  const params = new URLSearchParams(window.location.search);
  if (!params.has('v')) {
    const isMobile = /Mobile|iP(hone|od|ad)|Android|BlackBerry|IEMobile|Kindle|Opera M(obi|ini)|Windows Phone|webOS/i.test(navigator.userAgent);
    if (isMobile) {
      params.set('v', 'mobile');
      window.location.replace(window.location.pathname + '?' + params.toString());
    }
  }

  function adjustFontSize() {
    const viewportWidth = window.innerWidth;
    const calculatedSize = (viewportWidth - padding) / (cols * charRatio);
    // Round to nearest even integer to prevent subpixel rendering issues
    // (with line-height: 1.5, even font-size always yields integer line-height)
    const clamped = Math.max(minFontSize, Math.min(maxFontSize, calculatedSize));
    const fontSize = Math.round(clamped / 2) * 2;
    document.body.style.fontSize = fontSize + 'px';
  }

  function debounce(fn, ms) {
    let timeout;
    return function() {
      clearTimeout(timeout);
      timeout = setTimeout(fn, ms);
    };
  }

  adjustFontSize();
  window.addEventListener('resize', debounce(adjustFontSize, 100));
})();
</script>
</body>
</html>`
}

export type { TerminalData }
