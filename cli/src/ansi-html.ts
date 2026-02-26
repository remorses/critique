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
 * Convert a single span to HTML
 * Always wraps in span for consistent inline-block sizing
 */
function spanToHtml(span: CapturedSpan): string {
  const styles: string[] = []
  
  const fg = rgbaToHexOrNull(span.fg)
  const bg = rgbaToHexOrNull(span.bg)
  
  if (fg) {
    styles.push(`color:${fg}`)
  }
  if (bg) {
    styles.push(`background-color:${bg}`)
  }
  
  // Handle style flags using TextAttributes
  if (span.attributes & TextAttributes.BOLD) {
    styles.push("font-weight:bold")
  }
  if (span.attributes & TextAttributes.ITALIC) {
    styles.push("font-style:italic")
  }
  if (span.attributes & TextAttributes.UNDERLINE) {
    styles.push("text-decoration:underline")
  }
  if (span.attributes & TextAttributes.STRIKETHROUGH) {
    styles.push("text-decoration:line-through")
  }
  if (span.attributes & TextAttributes.DIM) {
    styles.push("opacity:0.5")
  }
  
  const escapedText = linkifyHtml(escapeHtml(span.text))
  
  // Always wrap in span for consistent inline-block sizing
  if (styles.length === 0) {
    return `<span>${escapedText}</span>`
  }
  
  return `<span style="${styles.join(";")}">${escapedText}</span>`
}

/**
 * Convert a single line to HTML
 */
function lineToHtml(line: CapturedLine): string {
  if (line.spans.length === 0) {
    return ""
  }
  return line.spans.map(spanToHtml).join("")
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
 */
export function frameToHtml(frame: CapturedFrame, options: ToHtmlOptions = {}): string {
  const { trimEmptyLines = true } = options

  let lines = frame.lines

  // Trim empty lines from the end
  if (trimEmptyLines) {
    while (lines.length > 0 && isLineEmpty(lines[lines.length - 1]!)) {
      lines = lines.slice(0, -1)
    }
  }

  // Render each line as a div
  const htmlLines = lines.map((line, lineIndex) => {
    const content = lineToHtml(line)
    // Use a div for each line to ensure proper line breaks
    // Empty lines get a span with nbsp for consistent flex behavior
    const defaultHtml = `<div class="line">${content || "<span>&nbsp;</span>"}</div>`
    return options.renderLine
      ? options.renderLine(defaultHtml, line, lineIndex)
      : defaultHtml
  })

  return htmlLines.join("\n")
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
  const content = frameToHtml(frame, options)

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
      html {
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
      src: url('https://critique.work/jetbrains-mono-nerd.woff2') format('woff2');
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }
    </style>
    <title>${escapeHtml(title)}</title>
    <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html {
      -webkit-text-size-adjust: 100%;
      text-size-adjust: 100%;
    }
    html, body {
      min-height: 100%;
      background-color: ${backgroundColor};
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
    body {
      padding: 16px;
      overflow-x: clip;
      overflow-y: auto;
      max-width: 100vw;
    }
    #content {
      width: fit-content;
      margin: 0 auto;
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
