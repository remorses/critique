import { describe, test, expect } from "bun:test"
import { spanToAnsi, frameToAnsi } from "./ansi-output.ts"
import { RGBA } from "@opentui/core"
import type { CapturedFrame, CapturedSpan, CapturedLine } from "@opentui/core"

const themeBg = RGBA.fromValues(0, 0, 0, 1) // Black background

describe("spanToAnsi", () => {
  test("plain text with no colors (level 0)", () => {
    const span: CapturedSpan = {
      text: "hello",
      fg: RGBA.fromValues(1, 1, 1, 1),
      bg: RGBA.fromValues(0, 0, 0, 0),
      attributes: 0,
      width: 5,
    }
    expect(spanToAnsi(span, 0, themeBg)).toMatchInlineSnapshot(`"hello"`)
  })

  test("truecolor foreground (level 3)", () => {
    const span: CapturedSpan = {
      text: "red",
      fg: RGBA.fromValues(1, 0, 0, 1), // Pure red
      bg: RGBA.fromValues(0, 0, 0, 0),
      attributes: 0,
      width: 3,
    }
    expect(spanToAnsi(span, 3, themeBg)).toMatchInlineSnapshot(`"\x1B[38;2;255;0;0mred\x1B[0m"`)
  })

  test("truecolor foreground and background (level 3)", () => {
    const span: CapturedSpan = {
      text: "styled",
      fg: RGBA.fromValues(1, 1, 1, 1), // White
      bg: RGBA.fromValues(0, 0, 1, 1), // Blue
      attributes: 0,
      width: 6,
    }
    expect(spanToAnsi(span, 3, themeBg)).toMatchInlineSnapshot(`"\x1B[38;2;255;255;255;48;2;0;0;255mstyled\x1B[0m"`)
  })

  test("256 colors (level 2)", () => {
    const span: CapturedSpan = {
      text: "256",
      fg: RGBA.fromValues(1, 0, 0, 1), // Red
      bg: RGBA.fromValues(0, 0, 0, 0),
      attributes: 0,
      width: 3,
    }
    expect(spanToAnsi(span, 2, themeBg)).toMatchInlineSnapshot(`"\x1B[38;5;196m256\x1B[0m"`)
  })

  test("16 colors (level 1)", () => {
    const span: CapturedSpan = {
      text: "basic",
      fg: RGBA.fromValues(1, 0, 0, 1), // Red -> bright red
      bg: RGBA.fromValues(0, 0, 0, 0),
      attributes: 0,
      width: 5,
    }
    expect(spanToAnsi(span, 1, themeBg)).toMatchInlineSnapshot(`"\x1B[31mbasic\x1B[0m"`)
  })

  test("bold attribute", () => {
    const span: CapturedSpan = {
      text: "bold",
      fg: RGBA.fromValues(1, 1, 1, 1),
      bg: RGBA.fromValues(0, 0, 0, 0),
      attributes: 1, // BOLD
      width: 4,
    }
    expect(spanToAnsi(span, 3, themeBg)).toMatchInlineSnapshot(`"\x1B[38;2;255;255;255;1mbold\x1B[0m"`)
  })

  test("multiple attributes (bold + italic + underline)", () => {
    const span: CapturedSpan = {
      text: "fancy",
      fg: RGBA.fromValues(1, 1, 1, 1),
      bg: RGBA.fromValues(0, 0, 0, 0),
      attributes: 1 | 4 | 8, // BOLD | ITALIC | UNDERLINE
      width: 5,
    }
    expect(spanToAnsi(span, 3, themeBg)).toMatchInlineSnapshot(`"\x1B[38;2;255;255;255;1;3;4mfancy\x1B[0m"`)
  })

  test("transparent foreground returns plain text", () => {
    const span: CapturedSpan = {
      text: "transparent",
      fg: RGBA.fromValues(1, 1, 1, 0), // Fully transparent
      bg: RGBA.fromValues(0, 0, 0, 0),
      attributes: 0,
      width: 11,
    }
    expect(spanToAnsi(span, 3, themeBg)).toMatchInlineSnapshot(`"transparent"`)
  })

  test("alpha blending with background", () => {
    const span: CapturedSpan = {
      text: "blend",
      fg: RGBA.fromValues(1, 1, 1, 0.5), // 50% white on black bg = gray
      bg: RGBA.fromValues(0, 0, 0, 0),
      attributes: 0,
      width: 5,
    }
    expect(spanToAnsi(span, 3, themeBg)).toMatchInlineSnapshot(`"\x1B[38;2;128;128;128mblend\x1B[0m"`)
  })
})

describe("frameToAnsi", () => {
  test("single line frame", () => {
    const frame: CapturedFrame = {
      cols: 10,
      rows: 1,
      cursor: [0, 0],
      lines: [
        {
          spans: [
            { text: "hello", fg: RGBA.fromValues(1, 0, 0, 1), bg: RGBA.fromValues(0, 0, 0, 0), attributes: 0, width: 5 },
          ],
        },
      ],
    }
    expect(frameToAnsi(frame, themeBg)).toMatchInlineSnapshot(`"hello"`)
  })

  test("multi-line frame", () => {
    const frame: CapturedFrame = {
      cols: 10,
      rows: 2,
      cursor: [0, 0],
      lines: [
        {
          spans: [
            { text: "line1", fg: RGBA.fromValues(1, 0, 0, 1), bg: RGBA.fromValues(0, 0, 0, 0), attributes: 0, width: 5 },
          ],
        },
        {
          spans: [
            { text: "line2", fg: RGBA.fromValues(0, 1, 0, 1), bg: RGBA.fromValues(0, 0, 0, 0), attributes: 0, width: 5 },
          ],
        },
      ],
    }
    expect(frameToAnsi(frame, themeBg)).toMatchInlineSnapshot(`
"line1
line2"
`)
  })

  test("trims empty lines from end", () => {
    const frame: CapturedFrame = {
      cols: 10,
      rows: 3,
      cursor: [0, 0],
      lines: [
        {
          spans: [
            { text: "content", fg: RGBA.fromValues(1, 1, 1, 1), bg: RGBA.fromValues(0, 0, 0, 0), attributes: 0, width: 7 },
          ],
        },
        { spans: [] }, // Empty line
        { spans: [{ text: "   ", fg: RGBA.fromValues(1, 1, 1, 1), bg: RGBA.fromValues(0, 0, 0, 0), attributes: 0, width: 3 }] }, // Whitespace only
      ],
    }
    expect(frameToAnsi(frame, themeBg)).toMatchInlineSnapshot(`"content"`)
  })

  test("preserves empty lines when trimEmptyLines is false", () => {
    const frame: CapturedFrame = {
      cols: 10,
      rows: 2,
      cursor: [0, 0],
      lines: [
        {
          spans: [
            { text: "content", fg: RGBA.fromValues(1, 1, 1, 1), bg: RGBA.fromValues(0, 0, 0, 0), attributes: 0, width: 7 },
          ],
        },
        { spans: [] },
      ],
    }
    expect(frameToAnsi(frame, themeBg, { trimEmptyLines: false })).toMatchInlineSnapshot(`
"content
"
`)
  })

  test("multiple spans per line", () => {
    const frame: CapturedFrame = {
      cols: 20,
      rows: 1,
      cursor: [0, 0],
      lines: [
        {
          spans: [
            { text: "red", fg: RGBA.fromValues(1, 0, 0, 1), bg: RGBA.fromValues(0, 0, 0, 0), attributes: 0, width: 3 },
            { text: " ", fg: RGBA.fromValues(1, 1, 1, 1), bg: RGBA.fromValues(0, 0, 0, 0), attributes: 0, width: 1 },
            { text: "green", fg: RGBA.fromValues(0, 1, 0, 1), bg: RGBA.fromValues(0, 0, 0, 0), attributes: 0, width: 5 },
          ],
        },
      ],
    }
    expect(frameToAnsi(frame, themeBg)).toMatchInlineSnapshot(`"red green"`)
  })
})
