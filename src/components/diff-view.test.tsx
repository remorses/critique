// Tests for DiffView theme reactivity when switching themes at runtime.

import * as React from "react"
import { afterEach, describe, expect, it } from "bun:test"
import { act } from "react"
import { testRender } from "@opentui/react/test-utils"
import { DiffView } from "./diff-view.tsx"
import { useAppStore } from "../store.ts"

const sampleDiff = `diff --git a/a.txt b/a.txt
index 1111111..2222222 100644
--- a/a.txt
+++ b/a.txt
@@ -1,2 +1,2 @@
-old
+new
 keep
`

function ThemeToggleHarness() {
  const themeName = useAppStore((s) => s.themeName)

  return (
    <DiffView
      diff={sampleDiff}
      view="unified"
      filetype="txt"
      themeName={themeName}
    />
  )
}

function extractDiffBackgroundSample(frame: any) {
  return {
    removedLineNumberBg: Array.from(frame.lines[0]!.spans[0]!.bg.buffer),
    removedContentBg: Array.from(frame.lines[0]!.spans[4]!.bg.buffer),
    contextBg: Array.from(frame.lines[2]!.spans[0]!.bg.buffer),
  }
}

describe("DiffView", () => {
  let testSetup: Awaited<ReturnType<typeof testRender>>

  afterEach(() => {
    if (testSetup) {
      testSetup.renderer.destroy()
    }
    useAppStore.setState({ themeName: "github" })
  })

  it("updates diff background colors after theme switch", async () => {
    useAppStore.setState({ themeName: "github" })

    testSetup = await testRender(<ThemeToggleHarness />, {
      width: 80,
      height: 8,
    })

    await act(async () => {
      await testSetup.renderOnce()
    })

    const before = extractDiffBackgroundSample(testSetup.captureSpans())
    expect(before).toMatchInlineSnapshot(`
      {
        "contextBg": [
          0,
          0,
          0,
          1,
        ],
        "removedContentBg": [
          0.3472549021244049,
          0.11725490540266037,
          0.11725490540266037,
          1,
        ],
        "removedLineNumberBg": [
          0.10980392247438431,
          0.05098039284348488,
          0.054901961237192154,
          1,
        ],
      }
    `)

    await act(async () => {
      useAppStore.setState({ themeName: "tokyonight" })
      await new Promise((r) => setTimeout(r, 10))
      await testSetup.renderOnce()
    })

    const after = extractDiffBackgroundSample(testSetup.captureSpans())
    expect(after).toMatchInlineSnapshot(`
      {
        "contextBg": [
          0.11764705926179886,
          0.125490203499794,
          0.1882352977991104,
          1,
        ],
        "removedContentBg": [
          0.3472549021244049,
          0.11725490540266037,
          0.11725490540266037,
          1,
        ],
        "removedLineNumberBg": [
          0.1764705926179886,
          0.12156862765550613,
          0.14901961386203766,
          1,
        ],
      }
    `)

    expect(after).not.toEqual(before)
  })
})
