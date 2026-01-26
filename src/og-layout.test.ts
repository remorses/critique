import { describe, test, expect } from "bun:test"

describe("OG image layout", () => {
  test("calculateOgImageLayout matches expected dimensions", async () => {
    const { renderDiffToFrame } = await import("./web-utils.ts")
    const { calculateOgImageLayout } = await import("./image.ts")

    const diff = `diff --git a/src/utils.ts b/src/utils.ts
index 1234567..abcdefg 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,3 +1,7 @@
 export function add(a: number, b: number) {
   return a + b
 }
+
+export function subtract(a: number, b: number) {
+  return a - b
+}
`

    const frame = await renderDiffToFrame(diff, {
      cols: 120,
      rows: 200,
      themeName: "github-light",
    })

    const layout = calculateOgImageLayout(frame, {
      width: 1200,
      height: 630,
      fontSize: 18,
      lineHeight: 1.95,
    })

    expect(layout.width).toBe(1200)
    expect(layout.height).toBe(630)
    expect(layout.paddingX).toBe(24)
    expect(layout.paddingY).toBe(20)
    expect(layout.lineHeightPx).toBe(35)
    expect(layout.availableHeight).toBe(590)
    expect(layout.visibleLines).toBeGreaterThan(0)
  })
})
