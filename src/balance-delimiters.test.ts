// Tests for delimiter balancing: tokenizer pass (countDelimiter) and fix pass (balanceDelimiters).

import { describe, expect, it } from "bun:test"
import { countDelimiter, balanceDelimiters } from "./balance-delimiters.js"

// ============================================================================
// countDelimiter — tokenizer pass
// ============================================================================

describe("countDelimiter", () => {
  describe("backticks (JS/TS/Go)", () => {
    it("counts backticks in plain code", () => {
      expect(countDelimiter("const x = `hello`", "`")).toBe(2)
    })

    it("counts single backtick (unclosed template)", () => {
      expect(countDelimiter("end of template`\nconst y = 1", "`")).toBe(1)
    })

    it("returns 0 for code without backticks", () => {
      expect(countDelimiter("const x = 1\nconst y = 2", "`")).toBe(0)
    })

    it("skips escaped backticks", () => {
      expect(countDelimiter("const x = `hello \\` world`", "`")).toBe(2)
    })

    it("handles nested template literals", () => {
      expect(countDelimiter("`outer ${`inner`} rest`", "`")).toBe(4)
    })

    it("handles backticks inside regex patterns", () => {
      expect(countDelimiter("const re = /\\`/g", "`")).toBe(0)
    })

    it("handles apostrophe inside template literal", () => {
      expect(countDelimiter("const s = `it's fine`", "`")).toBe(2)
    })

    it("handles URL inside template literal (://)", () => {
      expect(countDelimiter("const s = `https://example.com`", "`")).toBe(2)
    })

    it("handles protocol template literal", () => {
      expect(countDelimiter("const url = `${protocol}://${host}:${port}${path}`", "`")).toBe(2)
    })

    it("handles empty string", () => {
      expect(countDelimiter("", "`")).toBe(0)
    })

    it("handles escaped backslash before backtick", () => {
      expect(countDelimiter("const x = `end\\\\\\``", "`")).toBe(2)
    })
  })

  describe("triple double quotes (Python)", () => {
    it("counts triple quotes in docstring", () => {
      expect(countDelimiter('def foo():\n    """docstring"""\n    pass', '"""')).toBe(2)
    })

    it("counts single triple-quote (unclosed docstring)", () => {
      expect(countDelimiter('    This is inside a docstring.\n    """\n    return x', '"""')).toBe(1)
    })

    it("returns 0 for code without triple quotes", () => {
      expect(countDelimiter("x = 1\ny = 2", '"""')).toBe(0)
    })

    it("does not count single or double quotes as triple quotes", () => {
      expect(countDelimiter('x = "hello"\ny = "world"', '"""')).toBe(0)
    })

    it("handles four quotes (triple + one)", () => {
      // """" = one triple quote + one regular quote
      expect(countDelimiter('x = """"', '"""')).toBe(1)
    })

    it("handles six quotes (two triple quotes)", () => {
      expect(countDelimiter('x = """"""', '"""')).toBe(2)
    })

    it("skips escaped triple quotes", () => {
      // \""" — backslash escapes the first quote, remaining "" is not a triple
      expect(countDelimiter('x = \\"""', '"""')).toBe(0)
    })
  })

  describe("triple single quotes (Python)", () => {
    it("counts triple single quotes", () => {
      expect(countDelimiter("x = '''hello'''", "'''")).toBe(2)
    })

    it("counts single triple-single-quote (unclosed)", () => {
      expect(countDelimiter("    inside raw string\n    '''\n    return x", "'''")).toBe(1)
    })

    it("does not count single quotes as triple", () => {
      expect(countDelimiter("x = 'hello'\ny = 'world'", "'''")).toBe(0)
    })
  })

  describe("triple backticks (Markdown)", () => {
    it("counts fenced code block markers", () => {
      expect(countDelimiter("```ts\nconst x = 1\n```", "```")).toBe(2)
    })

    it("counts single fence marker (unclosed code block)", () => {
      expect(countDelimiter("still inside fence\n```", "```")).toBe(1)
    })

    it("returns 0 for plain markdown without fences", () => {
      expect(countDelimiter("# Title\n\nSome text with `inline` code", "```")).toBe(0)
    })
  })
})

// ============================================================================
// balanceDelimiters — fix pass
// ============================================================================

describe("balanceDelimiters", () => {
  const makePatch = (hunkLines: string[], filetype: string = "file.ts") => [
    `--- ${filetype}`,
    `+++ ${filetype}`,
    "@@ -10,4 +10,4 @@ function foo() {",
    ...hunkLines,
  ].join("\n")

  describe("typescript", () => {
    it("returns patch unchanged when backticks are balanced", () => {
      const patch = makePatch([
        " const x = `hello`",
        "-const y = `old`",
        "+const y = `new`",
        " const z = 1",
      ])
      expect(balanceDelimiters(patch, "typescript")).toBe(patch)
    })

    it("prepends balancing backtick when count is odd", () => {
      const patch = makePatch([
        " end of template`",
        " const x = 1",
        "-const y = 2",
        "+const y = 3",
      ])
      const result = balanceDelimiters(patch, "typescript")
      const lines = result.split("\n")
      expect(lines[2]).toBe("@@ -10,4 +10,4 @@ function foo() {")
      expect(lines[3]).toBe(" `end of template`")
      expect(lines[4]).toBe(" const x = 1")
    })

    it("returns patch unchanged for non-supported filetypes", () => {
      const patch = makePatch([" end of template`", " const x = 1"])
      expect(balanceDelimiters(patch, "rust")).toBe(patch)
      expect(balanceDelimiters(patch, undefined)).toBe(patch)
    })

    it("handles multiple hunks independently", () => {
      const patch = [
        "--- file.ts",
        "+++ file.ts",
        "@@ -5,3 +5,3 @@",
        " const x = `balanced`",
        "-const a = 1",
        "+const a = 2",
        "@@ -20,3 +20,3 @@",
        " closing`",
        "-const b = 1",
        "+const b = 2",
      ].join("\n")
      const result = balanceDelimiters(patch, "typescript")
      const lines = result.split("\n")
      expect(lines[3]).toBe(" const x = `balanced`")
      const secondHunkIdx = lines.findIndex((l, i) => i > 2 && l.startsWith("@@"))
      expect(lines[secondHunkIdx + 1]).toBe(" `closing`")
    })

    it("keeps patch unchanged for URL template literal (regression)", () => {
      const patch = makePatch([
        " const url = `${protocol}://${host}:${port}${path}`",
        " const x = 1",
        "-const y = 2",
        "+const y = 3",
      ])
      expect(balanceDelimiters(patch, "typescript")).toBe(patch)
    })

    it("keeps patch unchanged for WebSocket URL template from real patch", () => {
      const patch = [
        "--- src/client.ts",
        "+++ src/client.ts",
        "@@ -267,10 +267,16 @@ export class TunnelClient {",
        "     const protocol = localHttps ? 'wss' : 'ws'",
        "     const url = `${protocol}://${localHost}:${localPort}${msg.path}`",
        " ",
        "-    console.log(`WS OPEN ${msg.path} (${msg.connId})`)",
        "+    // Forward WebSocket subprotocol if present (e.g. \"vite-hmr\")",
        "+    const subprotocol = msg.headers['sec-websocket-protocol']",
        "+    const protocols = subprotocol",
        "+      ? subprotocol.split(',').map((p) => p.trim())",
        "+      : undefined",
        "+",
        "+    console.log(`WS OPEN ${msg.path} (${msg.connId})${protocols ? ` protocols=${protocols}` : ''}`)",
        " ",
        "     try {",
        "-      const localWs = new WebSocket(url)",
        "+      const localWs = new WebSocket(url, protocols)",
        " ",
        "       localWs.on('open', () => {",
        "         console.log(`WS CONNECTED ${msg.connId}`)",
      ].join("\n")
      expect(balanceDelimiters(patch, "typescript")).toBe(patch)
    })

    it("keeps patch unchanged for balanced template with apostrophe", () => {
      const patch = makePatch([
        " const s = `it's fine`",
        " const x = 1",
        "-const y = 2",
        "+const y = 3",
      ])
      expect(balanceDelimiters(patch, "typescript")).toBe(patch)
    })

    it("preserves no-newline markers", () => {
      const patch = [
        "--- file.ts",
        "+++ file.ts",
        "@@ -1,2 +1,2 @@",
        "-const x = `old",
        "+const x = `new",
        "\\ No newline at end of file",
      ].join("\n")
      const result = balanceDelimiters(patch, "typescript")
      expect(result).toContain("\\ No newline at end of file")
    })
  })

  describe("python", () => {
    const pyPatch = (hunkLines: string[]) => [
      "--- file.py",
      "+++ file.py",
      "@@ -10,4 +10,4 @@ def foo():",
      ...hunkLines,
    ].join("\n")

    it("returns patch unchanged when triple quotes are balanced", () => {
      const patch = pyPatch([
        ' """docstring"""',
        "-x = 1",
        "+x = 2",
        " return x",
      ])
      expect(balanceDelimiters(patch, "python")).toBe(patch)
    })

    it("prepends balancing triple double-quote when count is odd", () => {
      const patch = pyPatch([
        '     This is still inside the docstring.',
        '     """',
        "-    return old_value",
        "+    return new_value",
      ])
      const result = balanceDelimiters(patch, "python")
      const lines = result.split("\n")
      // First content line gets """ prepended
      expect(lines[3]).toBe(' """    This is still inside the docstring.')
    })

    it("prepends balancing triple single-quote when count is odd", () => {
      const patch = pyPatch([
        "     still inside raw string",
        "     '''",
        "-    x = 1",
        "+    x = 2",
      ])
      const result = balanceDelimiters(patch, "python")
      const lines = result.split("\n")
      expect(lines[3]).toBe(" '''    still inside raw string")
    })

    it("returns patch unchanged when regular quotes are present but balanced", () => {
      const patch = pyPatch([
        ' x = "hello"',
        "-y = 'old'",
        "+y = 'new'",
        " return x",
      ])
      expect(balanceDelimiters(patch, "python")).toBe(patch)
    })

    it("handles multiline docstring closing mid-hunk", () => {
      const patch = pyPatch([
        "     Args:",
        "         x: the input value",
        '     """',
        "-    return x + 1",
        "+    return x + 2",
      ])
      const result = balanceDelimiters(patch, "python")
      const lines = result.split("\n")
      // """ is odd (1), so prepend to first content line
      expect(lines[3]).toBe(' """    Args:')
    })

    it("does not modify when both triple-quote types are balanced", () => {
      const patch = pyPatch([
        ' """docstring"""',
        " x = '''raw'''",
        "-y = 1",
        "+y = 2",
      ])
      expect(balanceDelimiters(patch, "python")).toBe(patch)
    })
  })

  describe("go", () => {
    const goPatch = (hunkLines: string[]) => [
      "--- file.go",
      "+++ file.go",
      "@@ -10,4 +10,4 @@ func foo() {",
      ...hunkLines,
    ].join("\n")

    it("returns patch unchanged when backticks are balanced", () => {
      const patch = goPatch([
        " x := `raw string`",
        "-y := 1",
        "+y := 2",
        " return x",
      ])
      expect(balanceDelimiters(patch, "go")).toBe(patch)
    })

    it("prepends balancing backtick when count is odd", () => {
      const patch = goPatch([
        " still inside raw string`",
        " x := 1",
        "-y := 2",
        "+y := 3",
      ])
      const result = balanceDelimiters(patch, "go")
      const lines = result.split("\n")
      expect(lines[3]).toBe(" `still inside raw string`")
    })
  })

  describe("markdown", () => {
    const mdPatch = (hunkLines: string[]) => [
      "--- file.md",
      "+++ file.md",
      "@@ -10,4 +10,4 @@",
      ...hunkLines,
    ].join("\n")

    it("returns patch unchanged when code fences are balanced", () => {
      const patch = mdPatch([
        " ```ts",
        " const x = 1",
        " ```",
        "+New paragraph",
      ])
      expect(balanceDelimiters(patch, "markdown")).toBe(patch)
    })

    it("prepends balancing code fence when count is odd", () => {
      const patch = mdPatch([
        " inside fenced block",
        " ```",
        "-old line",
        "+new line",
      ])
      const result = balanceDelimiters(patch, "markdown")
      const lines = result.split("\n")
      expect(lines[3]).toBe(" ```inside fenced block")
    })

    it("does not modify when only inline code backticks are present", () => {
      const patch = mdPatch([
        " This has `inline` code",
        "-old",
        "+new",
      ])
      expect(balanceDelimiters(patch, "markdown")).toBe(patch)
    })
  })

  describe("scala", () => {
    const scalaPatch = (hunkLines: string[]) => [
      "--- file.scala",
      "+++ file.scala",
      "@@ -10,4 +10,4 @@ object Main {",
      ...hunkLines,
    ].join("\n")

    it("returns patch unchanged when triple quotes are balanced", () => {
      const patch = scalaPatch([
        ' val s = """multi',
        ' line string"""',
        "-val x = 1",
        "+val x = 2",
      ])
      expect(balanceDelimiters(patch, "scala")).toBe(patch)
    })

    it("prepends balancing triple quote when count is odd", () => {
      const patch = scalaPatch([
        "     still inside string",
        '     """.stripMargin',
        "-    val x = 1",
        "+    val x = 2",
      ])
      const result = balanceDelimiters(patch, "scala")
      const lines = result.split("\n")
      expect(lines[3]).toBe(' """    still inside string')
    })
  })

  describe("swift", () => {
    const swiftPatch = (hunkLines: string[]) => [
      "--- file.swift",
      "+++ file.swift",
      "@@ -10,4 +10,4 @@ func foo() {",
      ...hunkLines,
    ].join("\n")

    it("returns patch unchanged when triple quotes are balanced", () => {
      const patch = swiftPatch([
        ' let s = """',
        '     multi-line string',
        '     """',
        "-let x = 1",
      ])
      expect(balanceDelimiters(patch, "swift")).toBe(patch)
    })

    it("prepends balancing triple quote when count is odd", () => {
      const patch = swiftPatch([
        "     still inside multi-line string",
        '     """',
        "-    let x = 1",
        "+    let x = 2",
      ])
      const result = balanceDelimiters(patch, "swift")
      const lines = result.split("\n")
      expect(lines[3]).toBe(' """    still inside multi-line string')
    })
  })

  describe("julia", () => {
    const juliaPatch = (hunkLines: string[]) => [
      "--- file.jl",
      "+++ file.jl",
      "@@ -10,4 +10,4 @@ function foo()",
      ...hunkLines,
    ].join("\n")

    it("returns patch unchanged when triple quotes are balanced", () => {
      const patch = juliaPatch([
        ' s = """multi-line"""',
        "-x = 1",
        "+x = 2",
        " return x",
      ])
      expect(balanceDelimiters(patch, "julia")).toBe(patch)
    })

    it("prepends balancing triple quote when count is odd", () => {
      const patch = juliaPatch([
        "     still inside string",
        '     """',
        "-    x = 1",
        "+    x = 2",
      ])
      const result = balanceDelimiters(patch, "julia")
      const lines = result.split("\n")
      expect(lines[3]).toBe(' """    still inside string')
    })
  })

  describe("edge cases", () => {
    it("returns unchanged when no hunks present", () => {
      const patch = "--- file.ts\n+++ file.ts"
      expect(balanceDelimiters(patch, "typescript")).toBe(patch)
    })

    it("handles empty hunk", () => {
      const patch = "--- file.ts\n+++ file.ts\n@@ -1,0 +1,0 @@"
      expect(balanceDelimiters(patch, "typescript")).toBe(patch)
    })

    it("does not modify hunk with only no-newline markers", () => {
      const patch = [
        "--- file.py",
        "+++ file.py",
        "@@ -1,0 +1,0 @@",
        "\\ No newline at end of file",
      ].join("\n")
      expect(balanceDelimiters(patch, "python")).toBe(patch)
    })

    it("prepends to added line when first content line is +", () => {
      const patch = [
        "--- file.ts",
        "+++ file.ts",
        "@@ -0,0 +1,3 @@",
        "+const x = `open template",
        "+  content",
        "+  more",
      ].join("\n")
      const result = balanceDelimiters(patch, "typescript")
      const lines = result.split("\n")
      expect(lines[3]).toBe("+`const x = `open template")
    })

    it("handles all-removed hunk with odd backticks", () => {
      const patch = [
        "--- file.ts",
        "+++ file.ts",
        "@@ -5,2 +5,0 @@",
        "-const x = `old template",
        "-  content",
      ].join("\n")
      const result = balanceDelimiters(patch, "typescript")
      const lines = result.split("\n")
      expect(lines[3]).toBe("-`const x = `old template")
    })
  })
})
