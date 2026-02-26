// Tests mouse-wheel scrolling behavior in the main diff App scrollbox.

import * as React from "react"
import { afterEach, describe, expect, it } from "bun:test"
import { act } from "react"
import { testRender } from "@opentuah/react/test-utils"
import { App } from "./cli.js"
import type { ParsedFile } from "./diff-utils.js"

function createParsedFile(index: number): ParsedFile {
  const path = `src/file-${index.toString().padStart(2, "0")}.ts`

  return {
    oldFileName: `a/${path}`,
    newFileName: `b/${path}`,
    hunks: [{ lines: [`+export const value${index} = ${index}`] }],
    rawDiff: [
      `diff --git a/${path} b/${path}`,
      `--- a/${path}`,
      `+++ b/${path}`,
      "@@ -0,0 +1 @@",
      `+export const value${index} = ${index}`,
    ].join("\n"),
  }
}

describe("App scrollbox", () => {
  let testSetup: Awaited<ReturnType<typeof testRender>>

  afterEach(() => {
    if (testSetup) {
      act(() => {
        testSetup.renderer.destroy()
      })
    }
  })

  it("scrolls diff view content with mouse wheel", async () => {
    const parsedFiles = Array.from({ length: 40 }, (_, index) => createParsedFile(index))

    testSetup = await testRender(<App parsedFiles={parsedFiles} />, {
      width: 80,
      height: 20,
    })

    await act(async () => {
      await testSetup.renderOnce()
    })

    const before = testSetup.captureCharFrame()
    expect(before).toContain("file-00.ts")
    expect(before).not.toContain("a/src/file-")

    for (let i = 0; i < 20; i++) {
      await act(async () => {
        await testSetup.mockMouse.scroll(10, 10, "down")
        await testSetup.renderOnce()
      })
    }

    const after = testSetup.captureCharFrame()
    expect(after).not.toBe(before)
    expect(after).toContain("a/src/file-")
    expect(after).not.toContain("file-00.ts")
  })
})
