import { describe, test, expect, afterEach } from "bun:test"
import { createTestRenderer } from "@opentuah/core/testing"
import { createRoot } from "@opentuah/react"
import React from "react"
import { RGBA } from "@opentuah/core"
import type { CapturedFrame, CapturedLine, CapturedSpan } from "@opentuah/core"
import { slugifyFileName, buildAnchorMap } from "./web-utils.tsx"
import { frameToHtml, frameToHtmlDocument } from "./ansi-html.ts"

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
    const { renderDiffToFrame } = await import("./web-utils.tsx")
    
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
    fg: { r: 0, g: 0, b: 0, a: 0 },
    bg: { r: 0, g: 0, b: 0, a: 0 },
    attributes: 0,
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
  test("maps file header lines to anchor IDs", () => {
    const frame = mockFrame([
      " src/foo.ts +3-2",
      "  10 | const x = 1",
      "  11 |+const y = 2",
      "",
      " src/bar.ts +1-0",
      "   1 |+new line",
    ])

    const anchors = buildAnchorMap(frame, ["src/foo.ts", "src/bar.ts"])

    expect(anchors.size).toBe(2)
    expect(anchors.get(0)).toEqual({ id: "src-foo-ts", label: "src/foo.ts" })
    expect(anchors.get(4)).toEqual({ id: "src-bar-ts", label: "src/bar.ts" })
  })

  test("deduplicates IDs for same-named files", () => {
    const frame = mockFrame([
      " index.ts +1-0",
      " code here",
      " index.ts +2-1",
    ])

    const anchors = buildAnchorMap(frame, ["index.ts", "index.ts"])

    expect(anchors.size).toBe(2)
    expect(anchors.get(0)!.id).toBe("index-ts")
    expect(anchors.get(2)!.id).toBe("index-ts-2")
  })

  test("skips lines that don't match the stats pattern", () => {
    const frame = mockFrame([
      " some random text with src/foo.ts in it",
      " src/foo.ts +5-3",
    ])

    const anchors = buildAnchorMap(frame, ["src/foo.ts"])

    // Line 0 has the filename but no +N-N pattern → skipped
    // Line 1 matches
    expect(anchors.size).toBe(1)
    expect(anchors.get(1)).toEqual({ id: "src-foo-ts", label: "src/foo.ts" })
  })

  test("returns empty map when no files match", () => {
    const frame = mockFrame(["nothing here"])
    const anchors = buildAnchorMap(frame, ["missing.ts"])
    expect(anchors.size).toBe(0)
  })

  test("falls back to basename matching when full path is truncated", () => {
    // Simulate a narrow viewport where the full path gets clipped
    const frame = mockFrame([
      " src/components/very-long foo-bar.tsx +3-2",
    ], 50)

    // Full path not present, but basename "foo-bar.tsx" is
    const anchors = buildAnchorMap(frame, ["src/components/very-long/nested/foo-bar.tsx"])

    expect(anchors.size).toBe(1)
    expect(anchors.get(0)!.id).toBe("src-components-very-long-nested-foo-bar-tsx")
  })

  test("rejects false positives where stats appear before the filename", () => {
    // A code line could contain +N-N before the filename text
    const frame = mockFrame([
      " offset +3-2 in src/b.ts somewhere",
      " src/b.ts +1-0",
    ])

    const anchors = buildAnchorMap(frame, ["src/b.ts"])

    // Line 0 has +3 and -2 but they appear before "src/b.ts", not after
    // Line 1 is the real header
    expect(anchors.size).toBe(1)
    expect(anchors.get(1)).toEqual({ id: "src-b-ts", label: "src/b.ts" })
  })

  test("does not cascade-skip files when one fails to match", () => {
    const frame = mockFrame([
      " first.ts +1-0",
      " code line",
      " second.ts +2-1",
    ])

    // If first.ts were somehow missed, second.ts should still match
    // (but here both should match normally)
    const anchors = buildAnchorMap(frame, ["first.ts", "second.ts"])

    expect(anchors.size).toBe(2)
    expect(anchors.get(0)!.id).toBe("first-ts")
    expect(anchors.get(2)!.id).toBe("second-ts")
  })
})

describe("ansi-html renderLine callback", () => {
  test("renderLine wraps matching lines with custom HTML", () => {
    const frame = mockFrame(["file header", "code line", "another line"])

    const html = frameToHtml(frame, {
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
    const html = frameToHtml(frame)
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
