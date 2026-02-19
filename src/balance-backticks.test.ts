// Tests for backtick balancing: tokenizer pass (countBackticks) and fix pass (balanceBackticks).

import { describe, expect, it } from "bun:test"
import { countBackticks, balanceBackticks } from "./balance-backticks.ts"

// ============================================================================
// countBackticks — tokenizer pass
// ============================================================================

describe("countBackticks", () => {
  it("counts backticks in plain code", () => {
    expect(countBackticks("const x = `hello`")).toBe(2)
  })

  it("counts single backtick (unclosed template)", () => {
    expect(countBackticks("end of template`\nconst y = 1")).toBe(1)
  })

  it("returns 0 for code without backticks", () => {
    expect(countBackticks("const x = 1\nconst y = 2")).toBe(0)
  })

  it("skips escaped backticks", () => {
    expect(countBackticks("const x = `hello \\` world`")).toBe(2)
  })

  it("handles nested template literals", () => {
    expect(countBackticks("`outer ${`inner`} rest`")).toBe(4)
  })

  it("handles backticks inside regex patterns", () => {
    // /\`/g — backslash before backtick, skipped
    expect(countBackticks("const re = /\\`/g")).toBe(0)
  })

  it("handles apostrophe inside template literal (it's)", () => {
    expect(countBackticks("const s = `it's fine`")).toBe(2)
  })

  it("handles double quote inside template literal", () => {
    expect(countBackticks('const s = `class="foo"`')).toBe(2)
  })

  it("handles URL inside template literal (://)", () => {
    // The :// must NOT trigger comment state and hide the closing backtick
    expect(countBackticks("const s = `https://example.com`")).toBe(2)
  })

  it("handles protocol template literal", () => {
    // Real-world pattern: `${protocol}://${host}:${port}${path}`
    expect(countBackticks("const url = `${protocol}://${host}:${port}${path}`")).toBe(2)
  })

  it("handles nested template with apostrophe", () => {
    expect(countBackticks("const s = `a ${`it's nested`} b`")).toBe(4)
  })

  it("handles tagged template literals", () => {
    expect(countBackticks("const s = html`<div>hello</div>`")).toBe(2)
  })

  it("handles multiple unmatched backticks (odd > 1)", () => {
    expect(countBackticks("` text ` more `")).toBe(3)
  })

  it("handles empty string", () => {
    expect(countBackticks("")).toBe(0)
  })

  it("handles all-removed hunk content with backtick", () => {
    expect(countBackticks("const x = `old template")).toBe(1)
  })

  it("handles escaped backslash before backtick", () => {
    // \\\` — the first \\ is an escaped backslash, then \` is an escaped backtick
    expect(countBackticks("const x = `end\\\\\\``")).toBe(2)
  })

  // Backticks inside comments are counted (no comment state tracking).
  // This is a deliberate tradeoff: comment tracking would break on ://
  // in URL templates, which is far more common than odd-backtick comments.
  it("counts backticks inside comments (no comment tracking)", () => {
    // Single backtick in comment: counted (false positive, but rare)
    expect(countBackticks("// use ` for templates\nconst x = 1")).toBe(1)
    // Paired backticks in comment: counted but even, so no false positive
    expect(countBackticks("// use `template` syntax\nconst x = 1")).toBe(2)
  })

  it("counts backticks inside block comments (no comment tracking)", () => {
    expect(countBackticks("/* use ` for templates */\nconst x = 1")).toBe(1)
  })
})

// ============================================================================
// balanceBackticks — fix pass
// ============================================================================

describe("balanceBackticks", () => {
  const makePatch = (hunkLines: string[]) => [
    "--- file.ts",
    "+++ file.ts",
    "@@ -10,4 +10,4 @@ function foo() {",
    ...hunkLines,
  ].join("\n")

  it("returns patch unchanged when backticks are balanced", () => {
    const patch = makePatch([
      " const x = `hello`",
      "-const y = `old`",
      "+const y = `new`",
      " const z = 1",
    ])
    expect(balanceBackticks(patch, "typescript")).toBe(patch)
  })

  it("prepends balancing backtick to first content line when count is odd", () => {
    const patch = makePatch([
      " end of template`",
      " const x = 1",
      "-const y = 2",
      "+const y = 3",
    ])
    const result = balanceBackticks(patch, "typescript")
    const lines = result.split("\n")

    // Header stays the same (no adjustment needed)
    expect(lines[2]).toBe("@@ -10,4 +10,4 @@ function foo() {")
    // First content line gets backtick prepended to its content
    expect(lines[3]).toBe(" `end of template`")
    // Rest unchanged
    expect(lines[4]).toBe(" const x = 1")
  })

  it("returns patch unchanged for non-typescript filetypes", () => {
    const patch = makePatch([" end of template`", " const x = 1"])
    expect(balanceBackticks(patch, "python")).toBe(patch)
    expect(balanceBackticks(patch, undefined)).toBe(patch)
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

    const result = balanceBackticks(patch, "typescript")
    const lines = result.split("\n")

    // First hunk: 2 backticks (even) → unchanged
    expect(lines[2]).toBe("@@ -5,3 +5,3 @@")
    expect(lines[3]).toBe(" const x = `balanced`")

    // Second hunk: 1 backtick (odd) → backtick prepended to first line
    const secondHunkIdx = lines.findIndex((l, i) => i > 2 && l.startsWith("@@"))
    expect(lines[secondHunkIdx]).toBe("@@ -20,3 +20,3 @@")
    expect(lines[secondHunkIdx + 1]).toBe(" `closing`")
  })

  it("returns unchanged when no hunks present", () => {
    const patch = "--- file.ts\n+++ file.ts"
    expect(balanceBackticks(patch, "typescript")).toBe(patch)
  })

  it("preserves 'no newline at end of file' markers", () => {
    const patch = [
      "--- file.ts",
      "+++ file.ts",
      "@@ -1,2 +1,2 @@",
      "-const x = `old",
      "+const x = `new",
      "\\ No newline at end of file",
    ].join("\n")
    const result = balanceBackticks(patch, "typescript")
    expect(result).toContain("\\ No newline at end of file")
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
    const result = balanceBackticks(patch, "typescript")
    const lines = result.split("\n")

    expect(lines[2]).toBe("@@ -0,0 +1,3 @@")
    expect(lines[3]).toBe("+`const x = `open template")
  })

  it("does not modify hunk with only no-newline markers", () => {
    const patch = [
      "--- file.ts",
      "+++ file.ts",
      "@@ -1,0 +1,0 @@",
      "\\ No newline at end of file",
    ].join("\n")
    expect(balanceBackticks(patch, "typescript")).toBe(patch)
  })

  it("handles empty hunk (no lines after header)", () => {
    const patch = [
      "--- file.ts",
      "+++ file.ts",
      "@@ -1,0 +1,0 @@",
    ].join("\n")
    expect(balanceBackticks(patch, "typescript")).toBe(patch)
  })

  it("keeps patch unchanged for balanced template with apostrophe", () => {
    const patch = makePatch([
      " const s = `it's fine`",
      " const x = 1",
      "-const y = 2",
      "+const y = 3",
    ])
    expect(balanceBackticks(patch, "typescript")).toBe(patch)
  })

  it("keeps patch unchanged for URL template literal (regression)", () => {
    // Real-world regression: :// triggered comment state, hiding closing backtick
    const patch = makePatch([
      " const url = `${protocol}://${host}:${port}${path}`",
      " const x = 1",
      "-const y = 2",
      "+const y = 3",
    ])
    expect(balanceBackticks(patch, "typescript")).toBe(patch)
  })

  it("keeps patch unchanged for WebSocket URL template from real patch", () => {
    // Regression test from actual tunnel client patch
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
    // Must remain unchanged — all backticks are balanced (10 total, even)
    expect(balanceBackticks(patch, "typescript")).toBe(patch)
  })

  it("handles all-removed hunk with odd backticks", () => {
    const patch = [
      "--- file.ts",
      "+++ file.ts",
      "@@ -5,2 +5,0 @@",
      "-const x = `old template",
      "-  content",
    ].join("\n")
    const result = balanceBackticks(patch, "typescript")
    const lines = result.split("\n")
    expect(lines[3]).toBe("-`const x = `old template")
  })

  it("handles all-added hunk with odd backticks", () => {
    const patch = [
      "--- file.ts",
      "+++ file.ts",
      "@@ -5,0 +5,2 @@",
      "+const x = `new template",
      "+  content",
    ].join("\n")
    const result = balanceBackticks(patch, "typescript")
    const lines = result.split("\n")
    expect(lines[3]).toBe("+`const x = `new template")
  })
})
