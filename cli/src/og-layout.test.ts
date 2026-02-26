import { describe, test, expect, beforeAll } from "bun:test"

// Check if takumi is available (optional dependency)
let takumiAvailable = false
let Renderer: any
let container: any
let text: any

beforeAll(async () => {
  try {
    const core = await import("@takumi-rs/core")
    const helpers = await import("@takumi-rs/helpers")
    Renderer = core.Renderer
    container = helpers.container
    text = helpers.text
    takumiAvailable = true
  } catch {
    console.log("Skipping OG layout tests: takumi not installed")
  }
})

describe("OG image layout", () => {
  // OG image specs - must match src/image.ts renderFrameToOgImage
  const OG_WIDTH = 1200
  const OG_HEIGHT = 630
  const PADDING_X = 24
  const PADDING_Y = 20
  const FONT_SIZE = 16
  const LINE_HEIGHT = 1.5
  const LINE_HEIGHT_PX = Math.round(FONT_SIZE * LINE_HEIGHT) // 24px

  // Expected boundaries
  const CONTENT_WIDTH = OG_WIDTH - PADDING_X * 2  // 1152px
  const CONTENT_HEIGHT = OG_HEIGHT - PADDING_Y * 2  // 590px
  const CONTENT_LEFT = PADDING_X  // 24px
  const CONTENT_RIGHT = OG_WIDTH - PADDING_X  // 1176px
  const CONTENT_TOP = PADDING_Y  // 20px
  const CONTENT_BOTTOM = OG_HEIGHT - PADDING_Y  // 610px

  // Helper to get position from transform matrix [scaleX, skewY, skewX, scaleY, tx, ty]
  function getPos(transform: number[]): { x: number; y: number } {
    return { x: transform[4] ?? 0, y: transform[5] ?? 0 }
  }

  // Helper to create a line node matching our OG image structure
  function createLineNode(content: string) {
    return container({
      style: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        width: CONTENT_WIDTH,
        height: LINE_HEIGHT_PX,
        backgroundColor: "#1a1b26",
      },
      children: [
        text(content || " ", { display: "inline", color: "#ffffff" }),
        container({
          style: { flex: 1, height: "100%", backgroundColor: "#1a1b26" },
          children: [],
        }),
      ],
    })
  }

  test("line position: x starts at CONTENT_LEFT, extends to CONTENT_RIGHT", async () => {
    if (!takumiAvailable) return

    const renderer = new Renderer()
    const lineNode = createLineNode("Hello world")

    const rootNode = container({
      style: {
        display: "flex",
        flexDirection: "column",
        width: OG_WIDTH,
        height: OG_HEIGHT,
        backgroundColor: "#1a1b26",
        paddingTop: PADDING_Y,
        paddingBottom: PADDING_Y,
        paddingLeft: PADDING_X,
        paddingRight: PADDING_X,
      },
      children: [lineNode],
    })

    const result = await renderer.measure(rootNode)
    const line = result.children[0]
    const pos = getPos(line.transform)

    // Verify line position and width
    const lineLeft = pos.x
    const lineRight = pos.x + line.width

    console.log(`Line: left=${lineLeft}, right=${lineRight}, width=${line.width}`)
    console.log(`Expected: left=${CONTENT_LEFT}, right=${CONTENT_RIGHT}, width=${CONTENT_WIDTH}`)

    expect(lineLeft).toBe(CONTENT_LEFT)
    expect(line.width).toBe(CONTENT_WIDTH)
    expect(lineRight).toBe(CONTENT_RIGHT)
  })

  test("line position: y starts at CONTENT_TOP", async () => {
    if (!takumiAvailable) return

    const renderer = new Renderer()
    const lineNode = createLineNode("Line 1")

    const rootNode = container({
      style: {
        display: "flex",
        flexDirection: "column",
        width: OG_WIDTH,
        height: OG_HEIGHT,
        backgroundColor: "#1a1b26",
        paddingTop: PADDING_Y,
        paddingBottom: PADDING_Y,
        paddingLeft: PADDING_X,
        paddingRight: PADDING_X,
      },
      children: [lineNode],
    })

    const result = await renderer.measure(rootNode)
    const line = result.children[0]
    const pos = getPos(line.transform)

    console.log(`Line 1: y=${pos.y}, height=${line.height}`)
    console.log(`Expected: top=${CONTENT_TOP}`)

    expect(pos.y).toBe(CONTENT_TOP)
  })

  test("multiple lines: last line bottom edge near CONTENT_BOTTOM", async () => {
    if (!takumiAvailable) return

    const renderer = new Renderer()
    
    // Calculate max lines that fit
    const maxLines = Math.floor(CONTENT_HEIGHT / LINE_HEIGHT_PX)
    const lineNodes = Array.from({ length: maxLines }, (_, i) => createLineNode(`Line ${i + 1}`))

    const rootNode = container({
      style: {
        display: "flex",
        flexDirection: "column",
        width: OG_WIDTH,
        height: OG_HEIGHT,
        backgroundColor: "#1a1b26",
        paddingTop: PADDING_Y,
        paddingBottom: PADDING_Y,
        paddingLeft: PADDING_X,
        paddingRight: PADDING_X,
      },
      children: lineNodes,
    })

    const result = await renderer.measure(rootNode)
    
    const firstLine = result.children[0]
    const lastLine = result.children[maxLines - 1]
    const firstPos = getPos(firstLine.transform)
    const lastPos = getPos(lastLine.transform)

    const firstLineTop = firstPos.y
    const lastLineBottom = lastPos.y + LINE_HEIGHT_PX
    const usedHeight = lastLineBottom - firstLineTop
    const unusedAtBottom = CONTENT_BOTTOM - lastLineBottom

    console.log(`Total lines: ${maxLines}`)
    console.log(`First line top: ${firstLineTop} (expected: ${CONTENT_TOP})`)
    console.log(`Last line bottom: ${lastLineBottom} (expected near: ${CONTENT_BOTTOM})`)
    console.log(`Used height: ${usedHeight}px of ${CONTENT_HEIGHT}px (${(usedHeight / CONTENT_HEIGHT * 100).toFixed(1)}%)`)
    console.log(`Unused at bottom: ${unusedAtBottom}px (${(unusedAtBottom / CONTENT_HEIGHT * 100).toFixed(1)}%)`)

    // First line at top
    expect(firstPos.y).toBe(CONTENT_TOP)
    
    // Should use at least 95% of available height
    expect(usedHeight / CONTENT_HEIGHT).toBeGreaterThan(0.95)
    
    // Unused height should be less than 5%
    expect(unusedAtBottom / CONTENT_HEIGHT).toBeLessThan(0.05)
  })

  test("all lines: same width filling CONTENT_WIDTH", async () => {
    if (!takumiAvailable) return

    const renderer = new Renderer()
    const maxLines = Math.floor(CONTENT_HEIGHT / LINE_HEIGHT_PX)
    const lineNodes = Array.from({ length: maxLines }, (_, i) => createLineNode(`Line ${i + 1}`))

    const rootNode = container({
      style: {
        display: "flex",
        flexDirection: "column",
        width: OG_WIDTH,
        height: OG_HEIGHT,
        backgroundColor: "#1a1b26",
        paddingTop: PADDING_Y,
        paddingBottom: PADDING_Y,
        paddingLeft: PADDING_X,
        paddingRight: PADDING_X,
      },
      children: lineNodes,
    })

    const result = await renderer.measure(rootNode)

    // Check every line
    for (let i = 0; i < result.children.length; i++) {
      const line = result.children[i]
      const pos = getPos(line.transform)
      
      expect(line.width).toBe(CONTENT_WIDTH)
      expect(pos.x).toBe(CONTENT_LEFT)
      expect(pos.x + line.width).toBe(CONTENT_RIGHT)
    }

    console.log(`All ${result.children.length} lines have width=${CONTENT_WIDTH}, from x=${CONTENT_LEFT} to x=${CONTENT_RIGHT}`)
  })

  test("actual OG image layout matches expected dimensions", async () => {
    if (!takumiAvailable) return

    // Import the actual OG image rendering function's frame
    const { renderDiffToFrame } = await import("./web-utils.js")
    
    const sampleDiff = `diff --git a/test.ts b/test.ts
index 1234567..abcdefg 100644
--- a/test.ts
+++ b/test.ts
@@ -1,3 +1,7 @@
 export function add(a: number, b: number) {
   return a + b
 }
+
+export function subtract(a: number, b: number) {
+  return a - b
+}
`

    // Render to frame (same as OG image does)
    const frame = await renderDiffToFrame(sampleDiff, {
      cols: 90,
      maxRows: 100,
      themeName: "tokyonight",
    })

    console.log(`Frame: ${frame.cols} cols, ${frame.lines.length} lines`)
    
    // Now measure using the same layout as renderFrameToOgImage
    const renderer = new Renderer()
    const backgroundColor = "#1a1b26"
    
    const lineNodes = frame.lines.slice(0, 29).map((line: any) => {
      const textChildren = line.spans.map((span: any) => 
        text(span.text, { display: "inline", color: "#ffffff" })
      )
      if (textChildren.length === 0) {
        textChildren.push(text(" ", { color: backgroundColor }))
      }
      
      return container({
        style: {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          width: CONTENT_WIDTH,
          height: LINE_HEIGHT_PX,
          backgroundColor,
        },
        children: [
          ...textChildren,
          container({
            style: { flex: 1, height: "100%", backgroundColor },
            children: [],
          }),
        ],
      })
    })

    const rootNode = container({
      style: {
        display: "flex",
        flexDirection: "column",
        width: OG_WIDTH,
        height: OG_HEIGHT,
        backgroundColor,
        paddingTop: PADDING_Y,
        paddingBottom: PADDING_Y,
        paddingLeft: PADDING_X,
        paddingRight: PADDING_X,
      },
      children: lineNodes,
    })

    const result = await renderer.measure(rootNode)

    // Verify root
    expect(result.width).toBe(OG_WIDTH)
    expect(result.height).toBe(OG_HEIGHT)

    // Verify first line
    const firstLine = result.children[0]
    const firstPos = getPos(firstLine.transform)
    expect(firstPos.x).toBe(CONTENT_LEFT)
    expect(firstPos.y).toBe(CONTENT_TOP)
    expect(firstLine.width).toBe(CONTENT_WIDTH)

    // Verify last line
    const lastLine = result.children[result.children.length - 1]
    const lastPos = getPos(lastLine.transform)
    const lastBottom = lastPos.y + LINE_HEIGHT_PX

    console.log(`Actual OG layout:`)
    console.log(`  Root: ${result.width}x${result.height}`)
    console.log(`  Lines: ${result.children.length}`)
    console.log(`  First line: x=${firstPos.x}, y=${firstPos.y}, width=${firstLine.width}`)
    console.log(`  Last line bottom: ${lastBottom} (content bottom: ${CONTENT_BOTTOM})`)
    console.log(`  Used: ${((lastBottom - CONTENT_TOP) / CONTENT_HEIGHT * 100).toFixed(1)}%`)
  })

  test("spacer child fills remaining width after text", async () => {
    if (!takumiAvailable) return

    const renderer = new Renderer()
    const lineNode = createLineNode("Short")

    const rootNode = container({
      style: {
        display: "flex",
        flexDirection: "column",
        width: OG_WIDTH,
        height: OG_HEIGHT,
        paddingLeft: PADDING_X,
        paddingRight: PADDING_X,
        paddingTop: PADDING_Y,
        paddingBottom: PADDING_Y,
      },
      children: [lineNode],
    })

    const result = await renderer.measure(rootNode)
    const line = result.children[0]
    const linePos = getPos(line.transform)
    const textChild = line.children[0]
    const spacerChild = line.children[1]

    const textPos = getPos(textChild.transform)
    const spacerPos = getPos(spacerChild.transform)

    // Transforms are global, so text x = line x = CONTENT_LEFT
    console.log(`Line: x=${linePos.x}`)
    console.log(`Text: x=${textPos.x}, width=${textChild.width}`)
    console.log(`Spacer: x=${spacerPos.x}, width=${spacerChild.width}`)
    console.log(`Total child width: ${textChild.width + spacerChild.width} (expected: ${CONTENT_WIDTH})`)

    // Text starts at line start (global coords)
    expect(textPos.x).toBe(CONTENT_LEFT)
    
    // Spacer starts right after text
    expect(spacerPos.x).toBe(CONTENT_LEFT + textChild.width)
    
    // Combined width equals content width
    expect(textChild.width + spacerChild.width).toBe(CONTENT_WIDTH)
    
    // Spacer right edge at content right
    expect(spacerPos.x + spacerChild.width).toBe(CONTENT_RIGHT)
  })
})
