// Terminal output to HTML converter for web preview generation.
// Uses opentui's test renderer to capture structured span data and generates responsive HTML documents
// with proper font scaling to fit terminal content within viewport width.

import { TextAttributes, rgbToHex, type RGBA } from "@opentuah/core"
import type { CapturedFrame, CapturedLine, CapturedSpan } from "@opentuah/core"
import dedent from "string-dedent"

// Alias for syntax highlighting in editors (tagged template behaves identically)
const html = dedent

export interface ToHtmlOptions {
  /** Background color for the container */
  backgroundColor?: string
  /** Text color for the container */
  textColor?: string
  /** Font family for the output */
  fontFamily?: string
  /** Trim empty lines from the end */
  trimEmptyLines?: boolean
  /** Enable auto light/dark mode based on system preference */
  autoTheme?: boolean
  /** HTML document title */
  title?: string
  /** OG image URL for social media previews */
  ogImageUrl?: string
  /** Custom line renderer - wraps or replaces the default <div class="line"> output per line.
   *  Generic hook: receives the default HTML, the captured line data, and the 0-based line index.
   *  Return a replacement HTML string. If not provided, the default <div class="line"> is used. */
  renderLine?: (defaultHtml: string, line: CapturedLine, lineIndex: number) => string
  /** Extra CSS injected into the document style block */
  extraCss?: string
  /** Extra JS injected as a separate script block before </body> */
  extraJs?: string
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

function linkifyHtml(text: string): string {
  const urlRegex = /(https?:\/\/[^\s<]+)/g
  return text.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: inherit;">${url}</a>`
  })
}

/**
 * Convert RGBA to hex string, returning null for transparent colors
 */
function rgbaToHexOrNull(rgba: RGBA): string | null {
  if (rgba.a === 0) return null
  return rgbToHex(rgba)
}

/**
 * Build a CSS style key string from a span's visual properties.
 * Used as the dedup key for the class map.
 */
function spanStyleKey(span: CapturedSpan): string {
  const parts: string[] = []

  const fg = rgbaToHexOrNull(span.fg)
  const bg = rgbaToHexOrNull(span.bg)

  if (fg) parts.push(`color:${fg}`)
  if (bg) parts.push(`background-color:${bg}`)
  if (span.attributes & TextAttributes.BOLD) parts.push("font-weight:bold")
  if (span.attributes & TextAttributes.ITALIC) parts.push("font-style:italic")
  if (span.attributes & TextAttributes.UNDERLINE) parts.push("text-decoration:underline")
  if (span.attributes & TextAttributes.STRIKETHROUGH) parts.push("text-decoration:line-through")
  if (span.attributes & TextAttributes.DIM) parts.push("opacity:0.5")

  return parts.join(";")
}

/**
 * Style class map — maps CSS declaration strings to short class names.
 * Populated during frameToHtml, consumed by frameToHtmlDocument to emit
 * a compact <style> block instead of repeating inline styles on every span.
 *
 * A typical diff has 50-200 unique style combos. Using classes instead of
 * inline styles reduces HTML size by ~8MB on large diffs (185K spans ×
 * ~55 bytes per inline style attribute).
 */
class StyleClassMap {
  private map = new Map<string, string>()
  private counter = 0

  /** Get or create a class name for a CSS declaration string */
  getClass(styleKey: string): string {
    let cls = this.map.get(styleKey)
    if (!cls) {
      cls = `s${this.counter++}`
      this.map.set(styleKey, cls)
    }
    return cls
  }

  /** Generate the CSS block for all collected classes */
  toCss(): string {
    const rules: string[] = []
    for (const [style, cls] of this.map) {
      rules.push(`.${cls}{${style}}`)
    }
    return rules.join("\n")
  }
}

/**
 * Convert a single span to HTML using class-based styling.
 * The classMap collects unique style combos; the actual CSS is emitted later.
 */
function spanToHtml(span: CapturedSpan, classMap: StyleClassMap): string {
  const escapedText = linkifyHtml(escapeHtml(span.text))
  const key = spanStyleKey(span)

  if (key === "") {
    return `<span>${escapedText}</span>`
  }

  const cls = classMap.getClass(key)
  return `<span class="${cls}">${escapedText}</span>`
}

/**
 * Convert a single line to HTML
 */
function lineToHtml(line: CapturedLine, classMap: StyleClassMap): string {
  if (line.spans.length === 0) {
    return ""
  }
  return line.spans.map((span) => spanToHtml(span, classMap)).join("")
}

/**
 * Check if a line is empty (no spans or only whitespace content)
 */
function isLineEmpty(line: CapturedLine): boolean {
  if (line.spans.length === 0) return true
  // Check if all spans contain only whitespace
  return line.spans.every(span => span.text.trim() === "")
}

/**
 * Converts captured frame to styled HTML.
 * Renders HTML line by line from the CapturedFrame structure.
 * Returns both the content HTML and a CSS block for deduplicated span styles.
 */
export function frameToHtml(frame: CapturedFrame, options: ToHtmlOptions = {}): { html: string; spanCss: string } {
  const { trimEmptyLines = true } = options
  const classMap = new StyleClassMap()

  let lines = frame.lines

  // Trim empty lines from the end
  if (trimEmptyLines) {
    while (lines.length > 0 && isLineEmpty(lines[lines.length - 1]!)) {
      lines = lines.slice(0, -1)
    }
  }

  // Render each line as a div
  const htmlLines = lines.map((line, lineIndex) => {
    const content = lineToHtml(line, classMap)
    // Use a div for each line to ensure proper line breaks
    // Empty lines get a span with nbsp for consistent flex behavior
    const defaultHtml = `<div class="line">${content || "<span>&nbsp;</span>"}</div>`
    return options.renderLine
      ? options.renderLine(defaultHtml, line, lineIndex)
      : defaultHtml
  })

  return {
    html: htmlLines.join("\n"),
    spanCss: classMap.toCss(),
  }
}

/**
 * Generates a complete HTML document from captured frame.
 * Includes proper styling for terminal output display.
 * Font size automatically adjusts to fit content within viewport.
 */
export function frameToHtmlDocument(frame: CapturedFrame, options: ToHtmlOptions = {}): string {
  const {
    backgroundColor = "#ffffff",
    textColor = "#1a1a1a",
    fontFamily = "'JetBrains Mono Nerd', 'JetBrains Mono', 'Fira Code', Monaco, Menlo, 'Ubuntu Mono', Consolas, monospace",
    title = "Critique Diff",
  } = options

  const cols = frame.cols
  const { html: content, spanCss } = frameToHtml(frame, options)

  const ogTags = options.ogImageUrl ? '\n' + html`
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:type" content="website">
    <meta property="og:image" content="${escapeHtml(options.ogImageUrl)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:image" content="${escapeHtml(options.ogImageUrl)}">
  ` : ''

  const autoThemeCss = options.autoTheme ? '\n' + html`
    @media (prefers-color-scheme: light) {
      html, body {
        background-color: #ffffff;
      }
      #content {
        filter: invert(1) hue-rotate(180deg);
      }
    }
  ` : ''

  const extraJsBlock = options.extraJs
    ? `\n<script>\n${options.extraJs}\n</script>`
    : ''

  return html`
    <!DOCTYPE html>
    <html>
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="/favicon-dark.png" media="(prefers-color-scheme: dark)">
    <link rel="icon" href="/favicon-light.png" media="(prefers-color-scheme: light)">
    <link rel="icon" href="/favicon-dark.png">${ogTags}
    <style>
    @font-face {
      font-family: 'JetBrains Mono Nerd';
      src: url('/jetbrains-mono-nerd.woff2') format('woff2');
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }
    </style>
    <title>${escapeHtml(title)}</title>
    <style>
    /* Tailwind-style global defaults (safe for agentation widget) */
    *, ::before, ::after {
      box-sizing: border-box;
      border-width: 0;
      border-style: solid;
      border-color: currentColor;
    }
    html {
      -webkit-text-size-adjust: 100%;
      text-size-adjust: 100%;
      line-height: 1.5;
      tab-size: 4;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    html, body {
      min-height: 100%;
      margin: 0;
      background-color: ${backgroundColor};
    }
    body {
      overflow-x: clip;
      overflow-y: auto;
      max-width: 100vw;
    }
    img, video, svg {
      display: block;
      max-width: 100%;
    }
    /*
     * Diff content styles scoped to #content so they don't interfere
     * with the agentation widget which lives outside #content.
     */
    #content {
      width: fit-content;
      margin: 0 auto;
      padding: 16px;
      color: ${textColor};
      font-family: ${fontFamily};
      /*
       * Font size scales to fit ${cols} columns within viewport.
       * Formula: (viewport - padding) / (cols * char-ratio)
       *
       * The 0.6 char-ratio is the approximate width of 1ch relative to font-size
       * in monospace fonts. Most monospace fonts (JetBrains Mono, Fira Code,
       * Monaco, Consolas) have a ch/font-size ratio between 0.55-0.6.
       * We use 0.6 as a safe upper bound to prevent overflow.
       */
      font-size: clamp(4px, calc((100vw - 32px) / (${cols} * 0.6)), 14px);
      line-height: 1.7;
    }
    .line {
      white-space: pre;
      display: block;
      content-visibility: auto;
      contain-intrinsic-block-size: auto round(down, 1.7em, 1px);
      background-color: ${backgroundColor};
      transform: translateZ(0);
      backface-visibility: hidden;
    }
    .line span {
      white-space: pre;
      display: inline-block;
      line-height: 1.7;
      vertical-align: top;
    }
    /* Disable content-visibility on iOS Safari where it can cause rendering issues */
    @supports (-webkit-touch-callout: none) {
      .line {
        content-visibility: visible;
      }
    }${autoThemeCss}
    html {
      scrollbar-width: thin;
      scrollbar-color: #6b7280 #2d3748;
    }
    @media (prefers-color-scheme: light) {
      html {
        scrollbar-color: #a0aec0 #edf2f7;
      }
    }
    ::-webkit-scrollbar {
      width: 12px;
    }
    ::-webkit-scrollbar-track {
      background: #2d3748;
    }
    ::-webkit-scrollbar-thumb {
      background: #6b7280;
      border-radius: 6px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #a0aec0;
    }
    @media (prefers-color-scheme: light) {
      ::-webkit-scrollbar-track {
        background: #edf2f7;
      }
      ::-webkit-scrollbar-thumb {
        background: #a0aec0;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: #cbd5e1;
      }
    }
    ${options.extraCss || ''}
    ${spanCss}
    </style>
    </head>
    <body>
    <div id="content">
    ${content}
    </div>
    <script>
    // Redirect mobile devices to ?v=mobile for optimized view
    (function() {
      const params = new URLSearchParams(window.location.search);
      if (!params.has('v')) {
        const isMobile = /Mobile|iP(hone|od|ad)|Android|BlackBerry|IEMobile|Kindle|Opera M(obi|ini)|Windows Phone|webOS/i.test(navigator.userAgent);
        if (isMobile) {
          params.set('v', 'mobile');
          window.location.replace(window.location.pathname + '?' + params.toString() + window.location.hash);
        }
      }
    })();
    </script>${extraJsBlock}
    </body>
    </html>
  `
}

export type { CapturedFrame, CapturedLine, CapturedSpan }
