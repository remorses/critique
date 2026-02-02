import { describe, test, expect, afterEach } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { createRoot } from "@opentui/react"
import React from "react"
import { RGBA } from "@opentui/core"

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
