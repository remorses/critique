// Tests for delimiter balancing: tokenizer pass (countDelimiter) and fix pass (balanceDelimiters).

import { describe, expect, it } from "bun:test"
import { parsePatch } from "diff"
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

    it("escapes a leading closing backtick when count is odd", () => {
      const patch = makePatch([
        " end of template`",
        " const x = 1",
        "-const y = 2",
        "+const y = 3",
      ])
      const result = balanceDelimiters(patch, "typescript")
      const lines = result.split("\n")
      expect(lines[2]).toBe("@@ -10,4 +10,4 @@ function foo() {")
      expect(lines[3]).toBe(" end of template\\`")
      expect(lines[4]).toBe(" const x = 1")
    })

    it("returns patch unchanged for non-supported filetypes", () => {
      const patch = makePatch([" end of template`", " const x = 1"])
      expect(balanceDelimiters(patch, "ruby")).toBe(patch)
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
      expect(lines[secondHunkIdx + 1]).toBe(" closing\\`")
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

    it("keeps patch unchanged for regex literals with backticks", () => {
      const patch = makePatch([
        " const re = /`+/g",
        " const x = 1",
        "-const y = 2",
        "+const y = 3",
      ])
      expect(balanceDelimiters(patch, "typescript")).toBe(patch)
    })

    it("escapes a trailing unmatched opener instead of prepending a fake opener", () => {
      const patch = makePatch([
        " const x = `open template",
        " const y = 1",
        "-const z = 2",
        "+const z = 3",
      ])
      const result = balanceDelimiters(patch, "typescript")
      const lines = result.split("\n")
      expect(lines[3]).toBe(" const x = \\`open template")
      expect(lines[4]).toBe(" const y = 1")
    })

    it("appends a synthetic block comment closer before the next hunk", () => {
      const patch = [
        "--- file.ts",
        "+++ file.ts",
        "@@ -1,1 +1,3 @@",
        "+/**",
        "+ * open comment",
        " const x = 1",
        "@@ -10,1 +11,1 @@",
        "-const y = 1",
        "+const y = 2",
      ].join("\n")
      const result = balanceDelimiters(patch, "typescript")
      const lines = result.split("\n")
      const secondHunkIdx = lines.findIndex((line, index) => index > 2 && line.startsWith("@@"))
      expect(lines[2]).toBe("@@ -1,1 +1,3 @@")
      expect(lines[5]).toBe(" const x = 1 */")
      expect(secondHunkIdx).toBe(6)
      expect(() => parsePatch(result)).not.toThrow()
    })

    it("appends a synthetic block comment closer at the end of a single hunk", () => {
      const patch = [
        "--- file.ts",
        "+++ file.ts",
        "@@ -20,1 +20,3 @@",
        " interface DelimiterRule {",
        "+/**",
        "+ * Balance paired delimiters in a unified diff patch",
      ].join("\n")
      const result = balanceDelimiters(patch, "typescript")
      const lines = result.split("\n")
      expect(lines[2]).toBe("@@ -20,1 +20,3 @@")
      expect(lines.at(-1)).toBe("+ * Balance paired delimiters in a unified diff patch */")
      expect(() => parsePatch(result)).not.toThrow()
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

    it("escapes a leading closing triple double-quote when count is odd", () => {
      const patch = pyPatch([
        '     This is still inside the docstring.',
        '     """',
        "-    return old_value",
        "+    return new_value",
      ])
      const result = balanceDelimiters(patch, "python")
      const lines = result.split("\n")
      expect(lines[3]).toBe('     This is still inside the docstring.')
      expect(lines[4]).toBe('     \\"""')
    })

    it("escapes a leading closing triple single-quote when count is odd", () => {
      const patch = pyPatch([
        "     still inside raw string",
        "     '''",
        "-    x = 1",
        "+    x = 2",
      ])
      const result = balanceDelimiters(patch, "python")
      const lines = result.split("\n")
      expect(lines[3]).toBe("     still inside raw string")
      expect(lines[4]).toBe("     \\'''")
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
      expect(lines[3]).toBe("     Args:")
      expect(lines[5]).toBe('     \\"""')
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

    it("escapes a trailing unmatched opener instead of duplicating the token", () => {
      const patch = pyPatch([
        ' """docstring starts here',
        " value = 1",
        "-return old_value",
        "+return new_value",
      ])
      const result = balanceDelimiters(patch, "python")
      const lines = result.split("\n")
      expect(lines[3]).toBe(' \\"""docstring starts here')
      expect(lines[4]).toBe(" value = 1")
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

    it("escapes a leading closing backtick when count is odd", () => {
      const patch = goPatch([
        " still inside raw string`",
        " x := 1",
        "-y := 2",
        "+y := 3",
      ])
      const result = balanceDelimiters(patch, "go")
      const lines = result.split("\n")
      expect(lines[3]).toBe(" still inside raw string\\`")
    })

    it("appends a synthetic block comment closer when a hunk leaves one open", () => {
      const patch = [
        "--- file.go",
        "+++ file.go",
        "@@ -10,2 +10,3 @@ func foo() {",
        " /*",
        " still inside comment",
        "+x := 1",
      ].join("\n")
      const result = balanceDelimiters(patch, "go")
      const lines = result.split("\n")
      expect(lines[2]).toBe("@@ -10,2 +10,3 @@ func foo() {")
      expect(lines.at(-1)).toBe("+x := 1 */")
      expect(() => parsePatch(result)).not.toThrow()
    })
  })

  describe("rust", () => {
    it("appends a block comment closer to the last content line", () => {
      const patch = [
        "--- file.rs",
        "+++ file.rs",
        "@@ -10,1 +10,3 @@ fn demo() {",
        "+/*",
        "+ * open comment",
        " let x = 1",
      ].join("\n")
      const result = balanceDelimiters(patch, "rust")
      const lines = result.split("\n")
      expect(lines[5]).toBe(" let x = 1 */")
      expect(() => parsePatch(result)).not.toThrow()
    })
  })

  describe("html", () => {
    it("appends an HTML comment closer to isolate the next hunk", () => {
      const patch = [
        "--- file.html",
        "+++ file.html",
        "@@ -1,1 +1,3 @@",
        "+<!--",
        "+  open comment",
        " <div>content</div>",
        "@@ -10,1 +11,1 @@",
        "-<span>old</span>",
        "+<span>new</span>",
      ].join("\n")
      const result = balanceDelimiters(patch, "html")
      const lines = result.split("\n")
      const secondHunkIdx = lines.findIndex((line, index) => index > 2 && line.startsWith("@@"))
      expect(lines[5]).toBe(" <div>content</div> -->")
      expect(secondHunkIdx).toBe(6)
      expect(() => parsePatch(result)).not.toThrow()
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

    it("escapes a leading closing code fence when count is odd", () => {
      const patch = mdPatch([
        " inside fenced block",
        " ```",
        "-old line",
        "+new line",
      ])
      const result = balanceDelimiters(patch, "markdown")
      const lines = result.split("\n")
      expect(lines[3]).toBe(" inside fenced block")
      expect(lines[4]).toBe(" \\```")
    })

    it("does not modify when only inline code backticks are present", () => {
      const patch = mdPatch([
        " This has `inline` code",
        "-old",
        "+new",
      ])
      expect(balanceDelimiters(patch, "markdown")).toBe(patch)
    })

    it("escapes a trailing unmatched fence opener instead of duplicating it", () => {
      const patch = mdPatch([
        " ```ts",
        " const x = 1",
        "-old line",
        "+new line",
      ])
      const result = balanceDelimiters(patch, "markdown")
      const lines = result.split("\n")
      expect(lines[3]).toBe(" \\```ts")
      expect(lines[4]).toBe(" const x = 1")
    })

    it("escapes both boundary tokens when even count but first=closer last=opener (6 tokens)", () => {
      const patch = mdPatch([
        " ```",
        " ",
        " ## Section",
        " ",
        " ```ts",
        " const a = 1",
        " ```",
        " ",
        " ```ts",
        " const b = 2",
        " ```",
        " ",
        "+```ts",
      ])
      const result = balanceDelimiters(patch, "markdown")
      const lines = result.split("\n")
      // first bare ``` is boundary closer → escaped
      expect(lines[3]).toBe(" \\```")
      // last ```ts is boundary opener → escaped
      expect(lines[lines.length - 1]).toBe("+\\```ts")
      // middle fences stay untouched
      expect(lines[7]).toBe(" ```ts")
      expect(lines[9]).toBe(" ```")
      expect(lines[11]).toBe(" ```ts")
      expect(lines[13]).toBe(" ```")
    })

    it("escapes both boundary tokens with 4 tokens (bare, ```ts, bare, ```ts)", () => {
      const patch = mdPatch([
        " inside code block",
        " ```",
        " ",
        " ```ts",
        " const x = 1",
        " ```",
        " ",
        "+```ts",
      ])
      const result = balanceDelimiters(patch, "markdown")
      const lines = result.split("\n")
      expect(lines[4]).toBe(" \\```")
      expect(lines[lines.length - 1]).toBe("+\\```ts")
    })

    it("returns patch unchanged when 4 tokens are fully balanced (```ts, bare, ```ts, bare)", () => {
      const patch = mdPatch([
        " ```ts",
        " const a = 1",
        " ```",
        " ",
        " ```ts",
        " const b = 2",
        " ```",
        "+New paragraph",
      ])
      expect(balanceDelimiters(patch, "markdown")).toBe(patch)
    })

    it("escapes both boundary tokens when 2 tokens are bare-closer then opener", () => {
      const patch = mdPatch([
        " inside block",
        " ```",
        " ",
        "+```ts",
      ])
      const result = balanceDelimiters(patch, "markdown")
      const lines = result.split("\n")
      expect(lines[4]).toBe(" \\```")
      expect(lines[lines.length - 1]).toBe("+\\```ts")
    })

    it("returns patch unchanged for 2 balanced tokens (```ts then bare)", () => {
      const patch = mdPatch([
        " ```ts",
        " const x = 1",
        " ```",
        "+New paragraph",
      ])
      expect(balanceDelimiters(patch, "markdown")).toBe(patch)
    })

    it("returns patch unchanged for two bare fences (open + close, no language)", () => {
      const patch = mdPatch([
        " ```",
        " some code",
        " ```",
        "+New paragraph",
      ])
      expect(balanceDelimiters(patch, "markdown")).toBe(patch)
    })

    it("ignores inline triple backticks in prose (not at start of line)", () => {
      const patch = mdPatch([
        " Use the ``` delimiter for code fences",
        "-old",
        "+new",
      ])
      expect(balanceDelimiters(patch, "markdown")).toBe(patch)
    })

    it("treats fences with up to 3 spaces indent as valid", () => {
      const patch = mdPatch([
        "    ```ts",
        "    const x = 1",
        "    ```",
        "+New paragraph",
      ])
      // 3 spaces + ``` = column 3, indent 3 = valid fence
      expect(balanceDelimiters(patch, "markdown")).toBe(patch)
    })

    it("ignores fences indented more than 3 spaces (code indentation)", () => {
      const patch = mdPatch([
        "     ```ts",
        "     const x = 1",
        "-old",
        "+new",
      ])
      // 4+ spaces = not a fence, treated as code content → no escaping
      expect(balanceDelimiters(patch, "markdown")).toBe(patch)
    })

    it("handles 4-backtick fence pair correctly", () => {
      const patch = mdPatch([
        " ````ts",
        " const x = 1",
        " ````",
        "+New paragraph",
      ])
      expect(balanceDelimiters(patch, "markdown")).toBe(patch)
    })

    it("recognizes closing fence with trailing spaces", () => {
      const patch = mdPatch([
        " ```ts",
        " const x = 1",
        " ```   ",
        "+New paragraph",
      ])
      expect(balanceDelimiters(patch, "markdown")).toBe(patch)
    })

    it("handles two hunks independently for markdown fences", () => {
      const patch = [
        "--- file.md",
        "+++ file.md",
        "@@ -5,4 +5,4 @@",
        " ```ts",
        " const x = 1",
        " ```",
        "+New paragraph",
        "@@ -20,4 +20,4 @@",
        " inside block",
        " ```",
        "-old line",
        "+new line",
      ].join("\n")
      const result = balanceDelimiters(patch, "markdown")
      const lines = result.split("\n")
      // First hunk: balanced, no changes
      expect(lines[3]).toBe(" ```ts")
      expect(lines[5]).toBe(" ```")
      // Second hunk: bare closer at boundary → escaped
      const secondHunkIdx = lines.findIndex((l, i) => i > 2 && l.startsWith("@@"))
      expect(lines[secondHunkIdx + 2]).toBe(" \\```")
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

    it("escapes a leading closing triple quote when count is odd", () => {
      const patch = scalaPatch([
        "     still inside string",
        '     """.stripMargin',
        "-    val x = 1",
        "+    val x = 2",
      ])
      const result = balanceDelimiters(patch, "scala")
      const lines = result.split("\n")
      expect(lines[3]).toBe('     still inside string')
      expect(lines[4]).toBe('     \\""".stripMargin')
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

    it("escapes a leading closing triple quote when count is odd", () => {
      const patch = swiftPatch([
        "     still inside multi-line string",
        '     """',
        "-    let x = 1",
        "+    let x = 2",
      ])
      const result = balanceDelimiters(patch, "swift")
      const lines = result.split("\n")
      expect(lines[3]).toBe('     still inside multi-line string')
      expect(lines[4]).toBe('     \\"""')
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

    it("escapes a leading closing triple quote when count is odd", () => {
      const patch = juliaPatch([
        "     still inside string",
        '     """',
        "-    x = 1",
        "+    x = 2",
      ])
      const result = balanceDelimiters(patch, "julia")
      const lines = result.split("\n")
      expect(lines[3]).toBe('     still inside string')
      expect(lines[4]).toBe('     \\"""')
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

    it("escapes an unmatched opener on an added line", () => {
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
      expect(lines[3]).toBe("+const x = \\`open template")
    })

    it("escapes an unmatched opener on a removed line", () => {
      const patch = [
        "--- file.ts",
        "+++ file.ts",
        "@@ -5,2 +5,0 @@",
        "-const x = `old template",
        "-  content",
      ].join("\n")
      const result = balanceDelimiters(patch, "typescript")
      const lines = result.split("\n")
      expect(lines[3]).toBe("-const x = \\`old template")
    })
  })
})
