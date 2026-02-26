// Tests for DiffView theme reactivity when switching themes at runtime.

import * as React from "react"
import { afterEach, describe, expect, it } from "bun:test"
import { testRender } from "@opentuah/react/test-utils"
import { getDataPaths } from "@opentuah/core"
import { DiffView } from "./diff-view.js"
import { useAppStore } from "../store.js"

// Suppress EventTarget memory leak warning from opentui DataPathsManager —
// each DiffView registers a paths:changed listener during tree-sitter init
getDataPaths().setMaxListeners(50)

const sampleDiff = `diff --git a/a.txt b/a.txt
index 1111111..2222222 100644
--- a/a.txt
+++ b/a.txt
@@ -1,2 +1,2 @@
-old
+new
 keep
`

const wordHighlightDiff = `diff --git a/a.ts b/a.ts
index 1111111..2222222 100644
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-const value = oldName + 1
+const value = newName + 1
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

function getLineWithToken(frame: any, token: string) {
  return frame.lines.find((line: any) =>
    line.spans.some((span: any) => span.text.includes(token)),
  )
}

function getWordHighlightDistance(frame: any) {
  const removedLine = getLineWithToken(frame, "old")
  const addedLine = getLineWithToken(frame, "new")

  if (!removedLine || !addedLine) {
    throw new Error("Expected both added and removed lines in rendered frame")
  }

  const removedWord = removedLine.spans.find((span: any) => span.text === "old")
  const removedBase = removedLine.spans.find((span: any) => span.text.includes("Name"))
  const addedWord = addedLine.spans.find((span: any) => span.text === "new")
  const addedBase = addedLine.spans.find((span: any) => span.text.includes("Name"))

  if (!removedWord || !removedBase || !addedWord || !addedBase) {
    throw new Error("Expected split word/background spans for inline highlights")
  }

  const distance = (a: Float32Array, b: Float32Array) => {
    const dr = a[0]! - b[0]!
    const dg = a[1]! - b[1]!
    const db = a[2]! - b[2]!
    return Math.sqrt(dr * dr + dg * dg + db * db)
  }

  return {
    removed: distance(removedWord.bg.buffer, removedBase.bg.buffer),
    added: distance(addedWord.bg.buffer, addedBase.bg.buffer),
  }
}

// Suppress React act() warnings for opentui component tests.
// opentui's internal rendering triggers state updates outside act() boundaries,
// which is expected behavior for TUI component testing.
// testRender sets IS_REACT_ACT_ENVIRONMENT=true, so we must disable it after.
async function setupTest(jsx: React.ReactElement, opts: { width: number; height: number }) {
  const setup = await testRender(jsx, opts)
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
  return setup
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

    testSetup = await setupTest(<ThemeToggleHarness />, {
      width: 80,
      height: 8,
    })

    await testSetup.renderOnce()

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
          0.21176470816135406,
          0.11764705926179886,
          0.11764705926179886,
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

    useAppStore.setState({ themeName: "tokyonight" })
    await new Promise((r) => setTimeout(r, 10))
    await testSetup.renderOnce()

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
          0.5176470875740051,
          0.32156863808631897,
          0.4156862795352936,
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

  it("keeps word highlights visible on github dark theme", async () => {
    testSetup = await setupTest(
      <DiffView
        diff={wordHighlightDiff}
        view="unified"
        filetype="ts"
        themeName="github"
      />,
      {
        width: 80,
        height: 8,
      },
    )

    await testSetup.renderOnce()

    const highlights = getWordHighlightDistance(testSetup.captureSpans())
    expect(highlights.removed).toBeGreaterThan(0.03)
    expect(highlights.added).toBeGreaterThan(0.03)
  })

  it("keeps word highlights visible on near-black themes", async () => {
    testSetup = await setupTest(
      <DiffView
        diff={wordHighlightDiff}
        view="unified"
        filetype="ts"
        themeName="lucent-orng"
      />,
      {
        width: 80,
        height: 8,
      },
    )

    await testSetup.renderOnce()

    const highlights = getWordHighlightDistance(testSetup.captureSpans())
    expect(highlights.removed).toBeGreaterThan(0.01)
    expect(highlights.added).toBeGreaterThan(0.01)
  })
})
