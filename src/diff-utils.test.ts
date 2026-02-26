// Tests for rename/copy detection in git diff parsing.
// The `diff` npm package's parsePatch does not handle git's rename/copy headers,
// so preprocessDiff injects synthetic --- +++ headers for pure renames and
// extracts rename metadata for all rename/copy sections.

import { describe, expect, it } from "bun:test"
import { parsePatch, formatPatch } from "diff"
import {
  preprocessDiff,
  parseGitDiffFiles,
  getFileStatus,
  getFileName,
  getOldFileName,
  buildGitCommand,
  buildSubmoduleDiffCommand,
  filterParsedFilesByPatterns,
  getFilterPatterns,
  matchesFileFilters,
  detectFiletype,
} from "./diff-utils.js"

// ============================================================================
// preprocessDiff
// ============================================================================

describe("preprocessDiff", () => {
  it("should handle a pure rename (100% similarity, no content change)", () => {
    const rawDiff = [
      "diff --git old-name.ts new-name.ts",
      "similarity index 100%",
      "rename from old-name.ts",
      "rename to new-name.ts",
    ].join("\n")

    const { processedDiff, renameInfo } = preprocessDiff(rawDiff)

    // Should inject --- +++ headers
    expect(processedDiff).toContain("--- old-name.ts")
    expect(processedDiff).toContain("+++ new-name.ts")

    // Should extract rename metadata
    expect(renameInfo.size).toBe(1)
    const info = renameInfo.get(0)!
    expect(info.type).toBe("rename")
    expect(info.from).toBe("old-name.ts")
    expect(info.to).toBe("new-name.ts")
    expect(info.similarity).toBe(100)
  })

  it("should handle a rename with content changes", () => {
    const rawDiff = [
      "diff --git old-name.ts new-name.ts",
      "similarity index 51%",
      "rename from old-name.ts",
      "rename to new-name.ts",
      "index a02c366..52a3b29 100644",
      "--- old-name.ts",
      "+++ new-name.ts",
      "@@ -1,3 +1,3 @@",
      " function hello() {",
      '-  return "hello"',
      '+  return "hello world"',
      " }",
    ].join("\n")

    const { processedDiff, renameInfo } = preprocessDiff(rawDiff)

    // Should NOT inject extra --- +++ (already has them)
    const dashdashCount = (processedDiff.match(/^--- /gm) || []).length
    expect(dashdashCount).toBe(1)

    // Should extract metadata
    const info = renameInfo.get(0)!
    expect(info.type).toBe("rename")
    expect(info.from).toBe("old-name.ts")
    expect(info.to).toBe("new-name.ts")
    expect(info.similarity).toBe(51)
  })

  it("should handle a pure copy", () => {
    const rawDiff = [
      "diff --git original.ts copied.ts",
      "similarity index 100%",
      "copy from original.ts",
      "copy to copied.ts",
    ].join("\n")

    const { processedDiff, renameInfo } = preprocessDiff(rawDiff)

    // Should inject --- +++ headers
    expect(processedDiff).toContain("--- original.ts")
    expect(processedDiff).toContain("+++ copied.ts")

    const info = renameInfo.get(0)!
    expect(info.type).toBe("copy")
    expect(info.from).toBe("original.ts")
    expect(info.to).toBe("copied.ts")
    expect(info.similarity).toBe(100)
  })

  it("should handle mixed: pure rename + normal modification", () => {
    const rawDiff = [
      "diff --git old-name.ts new-name.ts",
      "similarity index 100%",
      "rename from old-name.ts",
      "rename to new-name.ts",
      "diff --git other.ts other.ts",
      "index abc..def 100644",
      "--- other.ts",
      "+++ other.ts",
      "@@ -1,3 +1,3 @@",
      " function foo() {",
      "-  return 1",
      "+  return 2",
      " }",
    ].join("\n")

    const { processedDiff, renameInfo } = preprocessDiff(rawDiff)

    // Pure rename should have injected headers
    expect(processedDiff).toContain("--- old-name.ts")
    expect(processedDiff).toContain("+++ new-name.ts")

    // Rename info should be on index 0
    expect(renameInfo.size).toBe(1)
    expect(renameInfo.get(0)!.type).toBe("rename")

    // Normal file should not have rename info
    expect(renameInfo.get(1)).toBeUndefined()
  })

  it("should handle multiple renames", () => {
    const rawDiff = [
      "diff --git a.ts b.ts",
      "similarity index 100%",
      "rename from a.ts",
      "rename to b.ts",
      "diff --git c.ts d.ts",
      "similarity index 80%",
      "rename from c.ts",
      "rename to d.ts",
      "index abc..def 100644",
      "--- c.ts",
      "+++ d.ts",
      "@@ -1,3 +1,4 @@",
      " const x = 1",
      " const y = 2",
      "+const z = 3",
      " export { x, y }",
    ].join("\n")

    const { renameInfo } = preprocessDiff(rawDiff)

    expect(renameInfo.size).toBe(2)
    expect(renameInfo.get(0)!).toEqual({ type: "rename", from: "a.ts", to: "b.ts", similarity: 100 })
    expect(renameInfo.get(1)!).toEqual({ type: "rename", from: "c.ts", to: "d.ts", similarity: 80 })
  })

  it("should handle diff with no renames (passthrough)", () => {
    const rawDiff = [
      "diff --git file.ts file.ts",
      "index abc..def 100644",
      "--- file.ts",
      "+++ file.ts",
      "@@ -1,3 +1,3 @@",
      " const x = 1",
      "-const y = 2",
      "+const y = 3",
    ].join("\n")

    const { processedDiff, renameInfo } = preprocessDiff(rawDiff)

    expect(renameInfo.size).toBe(0)
    // Output should be unchanged (same content)
    expect(processedDiff).toBe(rawDiff)
  })

  it("should handle empty diff", () => {
    const { processedDiff, renameInfo } = preprocessDiff("")

    expect(processedDiff).toBe("")
    expect(renameInfo.size).toBe(0)
  })

  it("should handle paths with directories", () => {
    const rawDiff = [
      "diff --git src/old/file.ts src/new/file.ts",
      "similarity index 100%",
      "rename from src/old/file.ts",
      "rename to src/new/file.ts",
    ].join("\n")

    const { processedDiff, renameInfo } = preprocessDiff(rawDiff)

    expect(processedDiff).toContain("--- src/old/file.ts")
    expect(processedDiff).toContain("+++ src/new/file.ts")
    expect(renameInfo.get(0)!.from).toBe("src/old/file.ts")
    expect(renameInfo.get(0)!.to).toBe("src/new/file.ts")
  })
})

// ============================================================================
// parseGitDiffFiles - end-to-end with parsePatch
// ============================================================================

describe("parseGitDiffFiles", () => {
  it("should parse a pure rename and create proper entry", () => {
    const rawDiff = [
      "diff --git old-name.ts new-name.ts",
      "similarity index 100%",
      "rename from old-name.ts",
      "rename to new-name.ts",
    ].join("\n")

    const files = parseGitDiffFiles(rawDiff, parsePatch)

    expect(files.length).toBe(1)
    expect(files[0]!.oldFileName).toBe("old-name.ts")
    expect(files[0]!.newFileName).toBe("new-name.ts")
    expect(files[0]!.hunks.length).toBe(0)
    expect(files[0]!.renameFrom).toBe("old-name.ts")
    expect(files[0]!.renameTo).toBe("new-name.ts")
    expect(files[0]!.similarity).toBe(100)
  })

  it("should parse a rename with content changes", () => {
    const rawDiff = [
      "diff --git old-name.ts new-name.ts",
      "similarity index 51%",
      "rename from old-name.ts",
      "rename to new-name.ts",
      "index a02c366..52a3b29 100644",
      "--- old-name.ts",
      "+++ new-name.ts",
      "@@ -1,3 +1,3 @@",
      " function hello() {",
      '-  return "hello"',
      '+  return "hello world"',
      " }",
    ].join("\n")

    const files = parseGitDiffFiles(rawDiff, parsePatch)

    expect(files.length).toBe(1)
    expect(files[0]!.oldFileName).toBe("old-name.ts")
    expect(files[0]!.newFileName).toBe("new-name.ts")
    expect(files[0]!.hunks.length).toBe(1)
    expect(files[0]!.hunks[0]!.lines.length).toBe(4)
    expect(files[0]!.renameFrom).toBe("old-name.ts")
    expect(files[0]!.renameTo).toBe("new-name.ts")
    expect(files[0]!.similarity).toBe(51)
  })

  it("should parse mixed: pure rename + normal modification", () => {
    const rawDiff = [
      "diff --git old-name.ts new-name.ts",
      "similarity index 100%",
      "rename from old-name.ts",
      "rename to new-name.ts",
      "diff --git other.ts other.ts",
      "index abc..def 100644",
      "--- other.ts",
      "+++ other.ts",
      "@@ -1,3 +1,3 @@",
      " function foo() {",
      "-  return 1",
      "+  return 2",
      " }",
    ].join("\n")

    const files = parseGitDiffFiles(rawDiff, parsePatch)

    expect(files.length).toBe(2)

    // First file: pure rename
    expect(files[0]!.oldFileName).toBe("old-name.ts")
    expect(files[0]!.newFileName).toBe("new-name.ts")
    expect(files[0]!.hunks.length).toBe(0)
    expect(files[0]!.renameFrom).toBe("old-name.ts")

    // Second file: normal modification
    expect(files[1]!.oldFileName).toBe("other.ts")
    expect(files[1]!.newFileName).toBe("other.ts")
    expect(files[1]!.hunks.length).toBe(1)
    expect(files[1]!.renameFrom).toBeUndefined()
  })

  it("should parse normal diff without renames (no regression)", () => {
    const rawDiff = [
      "diff --git src/utils.ts src/utils.ts",
      "index abc123..def456 100644",
      "--- src/utils.ts",
      "+++ src/utils.ts",
      "@@ -10,5 +10,7 @@ export function helper() {",
      "   const x = 1",
      "   const y = 2",
      "-  return x + y",
      "+  // Add validation",
      "+  if (x < 0) return 0",
      "+  return x + y + 1",
      "   // end",
      " }",
    ].join("\n")

    const files = parseGitDiffFiles(rawDiff, parsePatch)

    expect(files.length).toBe(1)
    expect(files[0]!.oldFileName).toBe("src/utils.ts")
    expect(files[0]!.newFileName).toBe("src/utils.ts")
    expect(files[0]!.hunks.length).toBe(1)
    expect(files[0]!.renameFrom).toBeUndefined()
    expect(files[0]!.renameTo).toBeUndefined()
  })

  it("should parse prisma schema diffs with model snippets", () => {
    const rawDiff = [
      "diff --git prisma/schema.prisma prisma/schema.prisma",
      "index abc123..def456 100644",
      "--- prisma/schema.prisma",
      "+++ prisma/schema.prisma",
      "@@ -1,4 +1,9 @@",
      " datasource db {",
      "   provider = \"postgresql\"",
      "   url      = env(\"DATABASE_URL\")",
      " }",
      "+",
      "+model User {",
      "+  id    Int    @id @default(autoincrement())",
      "+  email String @unique",
      "+}",
    ].join("\n")

    const files = parseGitDiffFiles(rawDiff, parsePatch)

    expect(files.length).toBe(1)
    expect(files[0]!.newFileName).toBe("prisma/schema.prisma")
    expect(files[0]!.hunks.length).toBe(1)
    expect(files[0]!.hunks[0]!.lines).toContain("+model User {")
  })

  it("should parse formatPatch output (Index header) without losing filenames", () => {
    const rawDiff = [
      "diff --git src/main.ts src/main.ts",
      "index abc123..def456 100644",
      "--- src/main.ts",
      "+++ src/main.ts",
      "@@ -1,1 +1,1 @@",
      "-const x = 1",
      "+const x = 2",
    ].join("\n")

    const parsed = parsePatch(rawDiff)
    const formatted = formatPatch(parsed[0]!)
    const files = parseGitDiffFiles(formatted, parsePatch)

    expect(files.length).toBe(1)
    expect(files[0]!.oldFileName).toBe("src/main.ts")
    expect(files[0]!.newFileName).toBe("src/main.ts")
    expect(files[0]!.hunks.length).toBe(1)
  })

  it("should parse copy with content changes", () => {
    const rawDiff = [
      "diff --git original.ts copied.ts",
      "similarity index 51%",
      "copy from original.ts",
      "copy to copied.ts",
      "index a02c366..52a3b29 100644",
      "--- original.ts",
      "+++ copied.ts",
      "@@ -1,3 +1,4 @@",
      " function hello() {",
      '-  return "hello"',
      '+  return "hello world"',
      " }",
      "+// extra",
    ].join("\n")

    const files = parseGitDiffFiles(rawDiff, parsePatch)

    expect(files.length).toBe(1)
    expect(files[0]!.oldFileName).toBe("original.ts")
    expect(files[0]!.newFileName).toBe("copied.ts")
    expect(files[0]!.renameFrom).toBe("original.ts")
    expect(files[0]!.renameTo).toBe("copied.ts")
    expect(files[0]!.similarity).toBe(51)
  })

  it("should handle rename + rename with changes together", () => {
    const rawDiff = [
      // Pure rename
      "diff --git a.ts b.ts",
      "similarity index 100%",
      "rename from a.ts",
      "rename to b.ts",
      // Rename with changes
      "diff --git c.ts d.ts",
      "similarity index 80%",
      "rename from c.ts",
      "rename to d.ts",
      "index abc..def 100644",
      "--- c.ts",
      "+++ d.ts",
      "@@ -1,2 +1,3 @@",
      " const x = 1",
      "+const y = 2",
      " export { x }",
    ].join("\n")

    const files = parseGitDiffFiles(rawDiff, parsePatch)

    expect(files.length).toBe(2)

    // Pure rename
    expect(files[0]!.renameFrom).toBe("a.ts")
    expect(files[0]!.renameTo).toBe("b.ts")
    expect(files[0]!.similarity).toBe(100)
    expect(files[0]!.hunks.length).toBe(0)

    // Rename with changes
    expect(files[1]!.renameFrom).toBe("c.ts")
    expect(files[1]!.renameTo).toBe("d.ts")
    expect(files[1]!.similarity).toBe(80)
    expect(files[1]!.hunks.length).toBe(1)
  })
})

// ============================================================================
// getFileStatus with rename support
// ============================================================================

describe("getFileStatus with renames", () => {
  it("should detect renamed files via renameFrom/renameTo", () => {
    expect(getFileStatus({
      oldFileName: "old.ts",
      newFileName: "new.ts",
      renameFrom: "old.ts",
      renameTo: "new.ts",
    })).toBe("renamed")
  })

  it("should detect renamed files via different filenames (--no-prefix)", () => {
    expect(getFileStatus({
      oldFileName: "old-name.ts",
      newFileName: "new-name.ts",
    })).toBe("renamed")
  })

  it("should still detect added files", () => {
    expect(getFileStatus({
      oldFileName: "/dev/null",
      newFileName: "new.ts",
    })).toBe("added")
  })

  it("should still detect deleted files", () => {
    expect(getFileStatus({
      oldFileName: "old.ts",
      newFileName: "/dev/null",
    })).toBe("deleted")
  })

  it("should still detect modified files (same name)", () => {
    expect(getFileStatus({
      oldFileName: "file.ts",
      newFileName: "file.ts",
    })).toBe("modified")
  })

  it("should handle missing oldFileName as added", () => {
    expect(getFileStatus({
      newFileName: "file.ts",
    })).toBe("added")
  })

  it("should handle missing newFileName as deleted", () => {
    expect(getFileStatus({
      oldFileName: "file.ts",
    })).toBe("deleted")
  })
})

// ============================================================================
// getFileName / getOldFileName with rename support
// ============================================================================

describe("getFileName with renames", () => {
  it("should return renameTo for renamed files", () => {
    expect(getFileName({
      oldFileName: "old.ts",
      newFileName: "new.ts",
      renameTo: "new.ts",
    })).toBe("new.ts")
  })

  it("should return newFileName for normal files", () => {
    expect(getFileName({
      oldFileName: "file.ts",
      newFileName: "file.ts",
    })).toBe("file.ts")
  })

  it("should handle /dev/null for new files", () => {
    expect(getFileName({
      oldFileName: "/dev/null",
      newFileName: "new.ts",
    })).toBe("new.ts")
  })
})

describe("getOldFileName", () => {
  it("should return renameFrom for renamed files", () => {
    expect(getOldFileName({
      oldFileName: "old.ts",
      newFileName: "new.ts",
      renameFrom: "old.ts",
      renameTo: "new.ts",
    })).toBe("old.ts")
  })

  it("should return old name when filenames differ (no metadata)", () => {
    expect(getOldFileName({
      oldFileName: "old.ts",
      newFileName: "new.ts",
    })).toBe("old.ts")
  })

  it("should return undefined for non-renamed files", () => {
    expect(getOldFileName({
      oldFileName: "file.ts",
      newFileName: "file.ts",
    })).toBeUndefined()
  })

  it("should return undefined for added files", () => {
    expect(getOldFileName({
      oldFileName: "/dev/null",
      newFileName: "file.ts",
    })).toBeUndefined()
  })

  it("should return undefined for deleted files", () => {
    expect(getOldFileName({
      oldFileName: "file.ts",
      newFileName: "/dev/null",
    })).toBeUndefined()
  })
})

// ============================================================================
// buildGitCommand includes rename detection
// ============================================================================

describe("buildGitCommand with rename detection", () => {
  it("should include -M flag in default diff", () => {
    const cmd = buildGitCommand({})
    expect(cmd).toContain("-M")
  })

  it("should include -M flag in staged diff", () => {
    const cmd = buildGitCommand({ staged: true })
    expect(cmd).toContain("-M")
  })

  it("should include -M flag in commit show", () => {
    const cmd = buildGitCommand({ commit: "abc123" })
    expect(cmd).toContain("-M")
  })

  it("should include -M flag in base...head diff", () => {
    const cmd = buildGitCommand({ base: "main", head: "feature" })
    expect(cmd).toContain("-M")
  })

  it("should use git diff for single base (compare to working tree)", () => {
    const cmd = buildGitCommand({ base: "HEAD~1" })
    expect(cmd).toContain("-M")
    expect(cmd).toStartWith("git diff HEAD~1")
    expect(cmd).not.toContain("git show")
  })

  it("should include -M flag in three-dot range", () => {
    const cmd = buildGitCommand({ base: "main...feature" })
    expect(cmd).toContain("-M")
  })

  it("should include -M flag in two-dot range", () => {
    const cmd = buildGitCommand({ base: "main..feature" })
    expect(cmd).toContain("-M")
  })
})

// ============================================================================
// filter helpers
// ============================================================================

describe("filter helpers", () => {
  it("should combine --filter and positional filters", () => {
    expect(
      getFilterPatterns({
        filter: ["src/**/*.ts", "src/**/*.ts", "README.md"],
        positionalFilters: ["packages/*/src/**"],
      })
    ).toEqual(["src/**/*.ts", "README.md", "packages/*/src/**"])
  })

  it("should match file paths using glob patterns", () => {
    expect(matchesFileFilters("submodules/opentui/packages/react/src/app.tsx", ["submodules/**/react/**/*.tsx"])).toBe(true)
    expect(matchesFileFilters("submodules/opentui/packages/core/src/app.ts", ["submodules/**/react/**/*.tsx"])).toBe(false)
  })

  it("should preserve plain path filter behavior", () => {
    expect(matchesFileFilters("src/main.ts", ["src"])).toBe(true)
    expect(matchesFileFilters("src/main.ts", ["src/"])).toBe(true)
    expect(matchesFileFilters("src/main.ts", ["./src"])).toBe(true)
    expect(matchesFileFilters("src/main.ts", ["."])).toBe(true)
    expect(matchesFileFilters("src/main.ts", ["./"])).toBe(true)
    expect(matchesFileFilters("src/main.ts", ["src/main.ts"])).toBe(true)
    expect(matchesFileFilters("src/main.ts", ["main.ts"])).toBe(false)
  })

  it("should filter parsed files after submodule diff merge", () => {
    const files = [
      {
        oldFileName: "src/main.ts",
        newFileName: "src/main.ts",
        hunks: [{ lines: ["+const app = 1"] }],
      },
      {
        oldFileName: "opentui/packages/react/src/index.tsx",
        newFileName: "opentui/packages/react/src/index.tsx",
        hunks: [{ lines: ["+export const x = 1"] }],
      },
      {
        oldFileName: "opentui/packages/core/src/index.ts",
        newFileName: "opentui/packages/core/src/index.ts",
        hunks: [{ lines: ["+export const y = 1"] }],
      },
    ]

    const filtered = filterParsedFilesByPatterns(files, {
      filter: "opentui/**/react/**/*.tsx",
    })

    expect(filtered).toHaveLength(1)
    expect(filtered[0]!.newFileName).toBe("opentui/packages/react/src/index.tsx")
  })
})

describe("buildSubmoduleDiffCommand", () => {
  it("should only scope to submodule paths and context", () => {
    const cmd = buildSubmoduleDiffCommand(["opentui", "errore"], { context: 7 })
    expect(cmd).toContain("git diff --no-prefix")
    expect(cmd).toContain("--submodule=diff")
    expect(cmd).toContain("-U7")
    expect(cmd).toContain("-- 'opentui' 'errore'")
  })
})

describe("detectFiletype", () => {
  it("should map .prisma files to prisma", () => {
    expect(detectFiletype("prisma/schema.prisma")).toBe("prisma")
  })
})

// ============================================================================
// parseHunksWithIds with renames
// ============================================================================

describe("parseHunksWithIds with renames", () => {
  it("should parse hunks from rename with changes", async () => {
    const { parseHunksWithIds } = await import("./review/hunk-parser.js")

    const rawDiff = [
      "diff --git old-name.ts new-name.ts",
      "similarity index 51%",
      "rename from old-name.ts",
      "rename to new-name.ts",
      "index a02c366..52a3b29 100644",
      "--- old-name.ts",
      "+++ new-name.ts",
      "@@ -1,3 +1,3 @@",
      " function hello() {",
      '-  return "hello"',
      '+  return "hello world"',
      " }",
    ].join("\n")

    const hunks = await parseHunksWithIds(rawDiff)

    expect(hunks.length).toBe(1)
    expect(hunks[0]!.filename).toBe("new-name.ts")
    expect(hunks[0]!.lines.length).toBe(4)
  })

  it("should produce no hunks for a pure rename", async () => {
    const { parseHunksWithIds } = await import("./review/hunk-parser.js")

    const rawDiff = [
      "diff --git old-name.ts new-name.ts",
      "similarity index 100%",
      "rename from old-name.ts",
      "rename to new-name.ts",
    ].join("\n")

    const hunks = await parseHunksWithIds(rawDiff)

    // Pure rename has no code changes = no hunks
    expect(hunks.length).toBe(0)
  })

  it("should handle pure rename followed by normal file", async () => {
    const { parseHunksWithIds } = await import("./review/hunk-parser.js")

    const rawDiff = [
      "diff --git old.ts new.ts",
      "similarity index 100%",
      "rename from old.ts",
      "rename to new.ts",
      "diff --git other.ts other.ts",
      "index abc..def 100644",
      "--- other.ts",
      "+++ other.ts",
      "@@ -1,3 +1,3 @@",
      " const x = 1",
      "-const y = 2",
      "+const y = 3",
      " export { x }",
    ].join("\n")

    const hunks = await parseHunksWithIds(rawDiff)

    // Pure rename = 0 hunks, normal file = 1 hunk
    expect(hunks.length).toBe(1)
    expect(hunks[0]!.filename).toBe("other.ts")
  })
})
