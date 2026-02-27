import { describe, test, expect, afterEach } from "bun:test"
import { createTestRenderer } from "@opentuah/core/testing"
import { createRoot } from "@opentuah/react"
import React from "react"
import { RGBA } from "@opentuah/core"
import type { CapturedFrame, CapturedLine, CapturedSpan } from "@opentuah/core"
import { slugifyFileName, buildAnchorMap } from "./web-utils.js"
import { frameToHtml, frameToHtmlDocument } from "./ansi-html.js"

describe("getSpanLines rendering", () => {
  let renderer: Awaited<ReturnType<typeof createTestRenderer>>["renderer"] | null = null

  afterEach(() => {
    renderer?.destroy()
    renderer = null
  })

  test("captures box-drawing characters correctly", async () => {
    const setup = await createTestRenderer({ width: 50, height: 5 })
    renderer = setup.renderer
    const { renderOnce } = setup

    function App() {
      return React.createElement("box", { style: { flexDirection: "column" } },
        React.createElement("text", { content: "├── src/errors" }),
        React.createElement("text", { content: "│   └── index.ts" }),
        React.createElement("text", { content: "└── api" }),
      )
    }

    createRoot(renderer).render(React.createElement(App))

    for (let i = 0; i < 5; i++) {
      await renderOnce()
      await new Promise(r => setTimeout(r, 50))
    }

    const buffer = renderer.currentRenderBuffer
    const text = new TextDecoder().decode(buffer.getRealCharBytes(true))
    const lines = text.split("\n")

    // Box-drawing characters should be preserved
    expect(lines[0]).toContain("├── src/errors")
    expect(lines[1]).toContain("│   └── index.ts")
    expect(lines[2]).toContain("└── api")
  })

  test("captures simple text correctly", async () => {
    const setup = await createTestRenderer({ width: 50, height: 3 })
    renderer = setup.renderer
    const { renderOnce } = setup

    function App() {
      return React.createElement("text", { content: "src/errors/index.ts" })
    }

    createRoot(renderer).render(React.createElement(App))

    for (let i = 0; i < 5; i++) {
      await renderOnce()
      await new Promise(r => setTimeout(r, 50))
    }

    const buffer = renderer.currentRenderBuffer
    const text = new TextDecoder().decode(buffer.getRealCharBytes(true))
    
    expect(text).toContain("src/errors/index.ts")
  })

  test("renderDiffToFrame uses getSpanLines for correct character decoding", async () => {
    // Import the function we're testing
    const { renderDiffToFrame } = await import("./web-utils.js")
    
    const diffContent = `diff --git a/test.ts b/test.ts
new file mode 100644
--- /dev/null
+++ b/test.ts
@@ -0,0 +1,3 @@
+export function test() {
+  return true
+}
`

    const frame = await renderDiffToFrame(diffContent, {
      cols: 80,
      maxRows: 30,
      themeName: "github",
    })

    // Check that we get proper content
    expect(frame.cols).toBe(80)
    // Content-fitting: rows should be <= max (30) and match actual content
    expect(frame.rows).toBeLessThanOrEqual(30)
    expect(frame.lines.length).toBe(frame.rows)
    
    // Find lines with actual content (not just spaces)
    const contentLines = frame.lines
      .map((line, i) => ({ i, text: line.spans.map(s => s.text).join("") }))
      .filter(({ text }) => text.trim().length > 0)
    
    // Should have content and the frame should be appropriately sized
    expect(contentLines.length).toBeGreaterThan(0)
    // With content-fitting, frame.rows should be close to actual content lines
    // (may have some empty lines for layout/spacing)
    expect(frame.rows).toBeGreaterThanOrEqual(contentLines.length)
  })
})

// Helper to create a mock CapturedSpan (transparent fg/bg → no inline styles)
function mockSpan(text: string): CapturedSpan {
  return {
    text,
    fg: RGBA.fromValues(0, 0, 0, 0),
    bg: RGBA.fromValues(0, 0, 0, 0),
    attributes: 0,
    width: text.length,
  }
}

// Helper to create a mock CapturedLine from text
function mockLine(text: string): CapturedLine {
  return { spans: [mockSpan(text)] }
}

// Helper to build a minimal CapturedFrame from text lines
function mockFrame(lines: string[], cols = 80): CapturedFrame {
  return {
    cols,
    rows: lines.length,
    cursor: [0, 0],
    lines: lines.map(mockLine),
  }
}

describe("slugifyFileName", () => {
  test("converts path separators to hyphens", () => {
    expect(slugifyFileName("src/components/foo-bar.tsx")).toBe("src-components-foo-bar-tsx")
  })

  test("lowercases and strips leading/trailing hyphens", () => {
    expect(slugifyFileName("  README.md  ")).toBe("readme-md")
  })

  test("collapses consecutive special characters", () => {
    expect(slugifyFileName("src///foo...bar")).toBe("src-foo-bar")
  })

  test("handles single-segment filenames", () => {
    expect(slugifyFileName("Makefile")).toBe("makefile")
  })
})

describe("buildAnchorMap", () => {
  test("maps section line positions to anchor IDs", () => {
    const anchors = buildAnchorMap([
      { lineIndex: 3, fileName: "src/foo.ts" },
      { lineIndex: 12, fileName: "src/bar.ts" },
    ])

    expect(anchors.size).toBe(2)
    expect(anchors.get(3)).toEqual({ id: "src-foo-ts", label: "src/foo.ts" })
    expect(anchors.get(12)).toEqual({ id: "src-bar-ts", label: "src/bar.ts" })
  })

  test("deduplicates IDs for same-named files", () => {
    const anchors = buildAnchorMap([
      { lineIndex: 4, fileName: "index.ts" },
      { lineIndex: 20, fileName: "index.ts" },
    ])

    expect(anchors.size).toBe(2)
    expect(anchors.get(4)!.id).toBe("index-ts")
    expect(anchors.get(20)!.id).toBe("index-ts-2")
  })

  test("returns empty map for empty input", () => {
    const anchors = buildAnchorMap([])
    expect(anchors.size).toBe(0)
  })

  test("uses fallback id when slugify removes all chars", () => {
    const anchors = buildAnchorMap([
      { lineIndex: 1, fileName: "---" },
      { lineIndex: 2, fileName: "***" },
    ])

    expect(anchors.size).toBe(2)
    expect(anchors.get(1)!.id).toBe("file")
    expect(anchors.get(2)!.id).toBe("file-2")
  })

  test("ignores invalid or duplicate line indexes", () => {
    const anchors = buildAnchorMap([
      { lineIndex: -1, fileName: "bad.ts" },
      { lineIndex: Number.NaN, fileName: "nan.ts" },
      { lineIndex: 7, fileName: "first.ts" },
      { lineIndex: 7, fileName: "second.ts" },
    ])

    expect(anchors.size).toBe(1)
    expect(anchors.get(7)).toEqual({ id: "first-ts", label: "first.ts" })
  })
})

describe("ansi-html renderLine callback", () => {
  test("renderLine wraps matching lines with custom HTML", () => {
    const frame = mockFrame(["file header", "code line", "another line"])

    const { html } = frameToHtml(frame, {
      renderLine: (defaultHtml, _line, lineIndex) => {
        if (lineIndex === 0) {
          return defaultHtml.replace(
            '<div class="line">',
            '<div id="my-section" class="line file-section">',
          )
        }
        return defaultHtml
      },
    })

    expect(html).toContain('id="my-section"')
    expect(html).toContain('class="line file-section"')
    // Other lines unchanged
    expect(html).toContain('<div class="line"><span>code line</span></div>')
  })

  test("without renderLine, output is default divs", () => {
    const frame = mockFrame(["hello"])
    const { html } = frameToHtml(frame)
    expect(html).toBe('<div class="line"><span>hello</span></div>')
  })
})

describe("ansi-html extraCss and extraJs", () => {
  test("extraCss is injected into document style block", () => {
    const frame = mockFrame(["test"])
    const doc = frameToHtmlDocument(frame, { extraCss: ".custom{color:red;}" })
    expect(doc).toContain(".custom{color:red;}")
    // Should appear before the last </style> (main CSS block, not font-face)
    const styleEnd = doc.lastIndexOf("</style>")
    const cssPos = doc.indexOf(".custom{color:red;}")
    expect(cssPos).toBeLessThan(styleEnd)
  })

  test("extraJs is injected as separate script block", () => {
    const frame = mockFrame(["test"])
    const doc = frameToHtmlDocument(frame, { extraJs: "console.log('hi')" })
    expect(doc).toContain("<script>\nconsole.log('hi')\n</script>")
  })

  test("mobile redirect preserves hash fragment", () => {
    const frame = mockFrame(["test"])
    const doc = frameToHtmlDocument(frame)
    expect(doc).toContain("+ window.location.hash")
  })
})
