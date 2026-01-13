import { describe, test, expect } from "bun:test"
import { ansiToHtml, ansiToHtmlDocument } from "./ansi-html"

describe("ansiToHtml", () => {
  test("converts simple text", () => {
    const html = ansiToHtml("Hello World")
    expect(html).toContain("Hello World")
  })

  test("converts colored text", () => {
    const html = ansiToHtml("\x1b[31mRed\x1b[0m \x1b[32mGreen\x1b[0m \x1b[34mBlue\x1b[0m")
    expect(html).toContain("Red")
    expect(html).toContain("Green")
    expect(html).toContain("Blue")
    // Should have color styles (uses CSS variables)
    expect(html).toContain("color:")
  })

  test("converts bold and italic text", () => {
    const html = ansiToHtml("\x1b[1mBold\x1b[0m \x1b[3mItalic\x1b[0m \x1b[4mUnderline\x1b[0m")
    expect(html).toContain("Bold")
    expect(html).toContain("font-weight")
    expect(html).toContain("bold")
    expect(html).toContain("font-style")
    expect(html).toContain("italic")
    expect(html).toContain("underline")
  })

  test("converts 256 color text", () => {
    const html = ansiToHtml("\x1b[38;5;196mBright Red\x1b[0m")
    expect(html).toContain("Bright Red")
    expect(html).toContain("color:")
  })

  test("converts RGB color text", () => {
    const html = ansiToHtml("\x1b[38;2;255;100;50mRGB Orange\x1b[0m")
    expect(html).toContain("RGB Orange")
    expect(html).toContain("color:")
  })

  test("converts background colors", () => {
    const html = ansiToHtml("\x1b[48;2;15;15;15m\x1b[38;2;255;255;255mWhite on dark\x1b[0m")
    expect(html).toContain("White on dark")
    expect(html).toContain("background-color:")
  })

  test("handles multiline content", () => {
    const html = ansiToHtml("Line 1\nLine 2\nLine 3")
    expect(html).toContain("Line 1")
    expect(html).toContain("Line 2")
    expect(html).toContain("Line 3")
  })

  test("escapes HTML special characters", () => {
    const html = ansiToHtml("<script>alert('xss')</script>")
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;")
    expect(html).toContain("&gt;")
  })

  test("handles complex diff-like output", () => {
    const ansi = `\x1b[38;2;255;255;255m\x1b[48;2;15;15;15m  /tmp/test.tsx\x1b[0m\x1b[38;2;0;255;0m +5\x1b[0m\x1b[38;2;255;0;0m-2\x1b[0m
\x1b[38;2;255;255;255m\x1b[48;2;60;0;0m 1 \x1b[0m\x1b[38;2;255;255;255m\x1b[48;2;52;13;13m import { foo } from "./api";\x1b[0m
\x1b[38;2;255;255;255m\x1b[48;2;0;50;0m 1 \x1b[0m\x1b[38;2;255;255;255m\x1b[48;2;20;30;22m import { foo, bar } from "./api";\x1b[0m`
    
    const html = ansiToHtml(ansi, { cols: 120, rows: 40 })
    expect(html).toContain("/tmp/test.tsx")
    expect(html).toContain("import")
    // Should have background colors for diff
    expect(html).toContain("background-color:")
  })

  test("returns content only without document wrapper", () => {
    const html = ansiToHtml("Test")
    // ansiToHtml returns just the content, not a full document
    expect(html).toContain('<div class="line">')
    expect(html).toContain("Test")
    // Should not include document elements - that's ansiToHtmlDocument's job
    expect(html).not.toContain("<!DOCTYPE")
    expect(html).not.toContain("<html>")
  })
})

describe("ansiToHtmlDocument", () => {
  test("generates complete HTML document", () => {
    const html = ansiToHtmlDocument("\x1b[32mHello\x1b[0m")
    expect(html).toContain("<!DOCTYPE html>")
    expect(html).toContain("<html>")
    expect(html).toContain("<head>")
    expect(html).toContain("<body>")
    expect(html).toContain("Hello")
  })

  test("uses custom background color", () => {
    const html = ansiToHtmlDocument("Test", { backgroundColor: "#1a1a2e" })
    expect(html).toContain("#1a1a2e")
  })

  test("uses custom font settings", () => {
    const html = ansiToHtmlDocument("Test", { 
      fontFamily: "JetBrains Mono",
      fontSize: "16px" 
    })
    expect(html).toContain("JetBrains Mono")
    expect(html).toContain("16px")
  })
})
