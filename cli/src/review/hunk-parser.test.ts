// Comprehensive tests for hunk splitting and coverage tracking

import { describe, expect, it } from "bun:test"
import { parsePatch } from "diff"
import {
  calculateLineOffsets,
  createSubHunk,
  createHunk,
  buildPatch,
  initializeCoverage,
  markCovered,
  markHunkFullyCovered,
  updateCoverageFromGroup,
  getUncoveredPortions,
  formatUncoveredMessage,
  combineHunkPatches,
} from "./hunk-parser.js"
import type { ReviewGroup } from "./types.js"

describe("calculateLineOffsets", () => {
  it("should return zero offsets for index 0", () => {
    const lines = [" context", "-removed", "+added"]
    const result = calculateLineOffsets(lines, 0)
    expect(result).toEqual({ oldOffset: 0, newOffset: 0 })
  })

  it("should count context lines for both old and new", () => {
    const lines = [" context1", " context2", " context3"]
    const result = calculateLineOffsets(lines, 2)
    expect(result).toEqual({ oldOffset: 2, newOffset: 2 })
  })

  it("should count removed lines only for old", () => {
    const lines = ["-removed1", "-removed2", " context"]
    const result = calculateLineOffsets(lines, 2)
    expect(result).toEqual({ oldOffset: 2, newOffset: 0 })
  })

  it("should count added lines only for new", () => {
    const lines = ["+added1", "+added2", " context"]
    const result = calculateLineOffsets(lines, 2)
    expect(result).toEqual({ oldOffset: 0, newOffset: 2 })
  })

  it("should handle mixed lines correctly", () => {
    // Line 0: context (old=1, new=1)
    // Line 1: removed (old=2, new=1)
    // Line 2: added (old=2, new=2)
    // Line 3: added (old=2, new=3)
    // Line 4: context (old=3, new=4)
    const lines = [" context", "-removed", "+added1", "+added2", " context2"]
    
    expect(calculateLineOffsets(lines, 0)).toEqual({ oldOffset: 0, newOffset: 0 })
    expect(calculateLineOffsets(lines, 1)).toEqual({ oldOffset: 1, newOffset: 1 })
    expect(calculateLineOffsets(lines, 2)).toEqual({ oldOffset: 2, newOffset: 1 })
    expect(calculateLineOffsets(lines, 3)).toEqual({ oldOffset: 2, newOffset: 2 })
    expect(calculateLineOffsets(lines, 4)).toEqual({ oldOffset: 2, newOffset: 3 })
    expect(calculateLineOffsets(lines, 5)).toEqual({ oldOffset: 3, newOffset: 4 })
  })

  it("should handle index beyond array length", () => {
    const lines = [" context"]
    const result = calculateLineOffsets(lines, 100)
    expect(result).toEqual({ oldOffset: 1, newOffset: 1 })
  })

  it("should handle empty array", () => {
    const result = calculateLineOffsets([], 5)
    expect(result).toEqual({ oldOffset: 0, newOffset: 0 })
  })
})

describe("createSubHunk", () => {
  const originalHunk = createHunk(1, "src/file.ts", 0, 10, 10, [
    " function foo() {",      // 0: context
    "-  return null",         // 1: removed
    "+  // validation",       // 2: added
    "+  if (!x) return null", // 3: added
    "+  return process(x)",   // 4: added
    " }",                     // 5: context
    " ",                      // 6: context
    "-const old = 1",         // 7: removed
    "+const new = 2",         // 8: added
    " export { foo }",        // 9: context
  ])

  it("should create sub-hunk for first portion", () => {
    const subHunk = createSubHunk(originalHunk, 0, 2)
    
    expect(subHunk.lines).toEqual([
      " function foo() {",
      "-  return null",
      "+  // validation",
    ])
    expect(subHunk.oldStart).toBe(10)
    expect(subHunk.newStart).toBe(10)
    expect(subHunk.oldLines).toBe(2) // 1 context + 1 removed
    expect(subHunk.newLines).toBe(2) // 1 context + 1 added
  })

  it("should create sub-hunk for middle portion", () => {
    // Lines 2-5: added, added, added, context
    const subHunk = createSubHunk(originalHunk, 2, 5)
    
    expect(subHunk.lines).toEqual([
      "+  // validation",
      "+  if (!x) return null",
      "+  return process(x)",
      " }",
    ])
    // After lines 0-1: old consumed 2 (context + removed), new consumed 1 (context)
    expect(subHunk.oldStart).toBe(12) // 10 + 2
    expect(subHunk.newStart).toBe(11) // 10 + 1
    expect(subHunk.oldLines).toBe(1)  // just the closing brace context
    expect(subHunk.newLines).toBe(4)  // 3 added + 1 context
  })

  it("should create sub-hunk for last portion", () => {
    const subHunk = createSubHunk(originalHunk, 7, 9)
    
    expect(subHunk.lines).toEqual([
      "-const old = 1",
      "+const new = 2",
      " export { foo }",
    ])
    // After lines 0-6: calculate offset
    const offset = calculateLineOffsets(originalHunk.lines, 7)
    expect(subHunk.oldStart).toBe(10 + offset.oldOffset)
    expect(subHunk.newStart).toBe(10 + offset.newOffset)
  })

  it("should handle single line sub-hunk", () => {
    const subHunk = createSubHunk(originalHunk, 3, 3)
    
    expect(subHunk.lines).toEqual(["+  if (!x) return null"])
    expect(subHunk.oldLines).toBe(0)
    expect(subHunk.newLines).toBe(1)
  })

  it("should clamp end index to array bounds", () => {
    const subHunk = createSubHunk(originalHunk, 8, 100)
    
    expect(subHunk.lines).toEqual([
      "+const new = 2",
      " export { foo }",
    ])
  })

  it("should clamp start index to 0", () => {
    const subHunk = createSubHunk(originalHunk, -5, 1)
    
    expect(subHunk.lines).toEqual([
      " function foo() {",
      "-  return null",
    ])
    expect(subHunk.oldStart).toBe(10)
    expect(subHunk.newStart).toBe(10)
  })

  it("should throw for invalid range where start > end", () => {
    expect(() => createSubHunk(originalHunk, 5, 2)).toThrow()
  })

  it("should generate valid patch for sub-hunk", () => {
    const subHunk = createSubHunk(originalHunk, 0, 5)
    
    // The rawDiff should be parseable
    expect(subHunk.rawDiff).toContain("--- a/src/file.ts")
    expect(subHunk.rawDiff).toContain("+++ b/src/file.ts")
    expect(subHunk.rawDiff).toContain("@@")
  })

  it("should preserve hunk id and filename", () => {
    const subHunk = createSubHunk(originalHunk, 0, 2)
    
    expect(subHunk.id).toBe(originalHunk.id)
    expect(subHunk.filename).toBe(originalHunk.filename)
    expect(subHunk.hunkIndex).toBe(originalHunk.hunkIndex)
  })
})

describe("createSubHunk edge cases", () => {
  it("should handle hunk with only added lines", () => {
    const hunk = createHunk(1, "new-file.ts", 0, 0, 1, [
      "+line1",
      "+line2",
      "+line3",
    ])
    
    const subHunk = createSubHunk(hunk, 1, 2)
    expect(subHunk.lines).toEqual(["+line2", "+line3"])
    expect(subHunk.oldStart).toBe(0)
    expect(subHunk.newStart).toBe(2) // after line1
    expect(subHunk.oldLines).toBe(0)
    expect(subHunk.newLines).toBe(2)
  })

  it("should handle hunk with only removed lines", () => {
    const hunk = createHunk(1, "deleted.ts", 0, 1, 0, [
      "-line1",
      "-line2",
      "-line3",
    ])
    
    const subHunk = createSubHunk(hunk, 0, 1)
    expect(subHunk.lines).toEqual(["-line1", "-line2"])
    expect(subHunk.oldStart).toBe(1)
    expect(subHunk.newStart).toBe(0)
    expect(subHunk.oldLines).toBe(2)
    expect(subHunk.newLines).toBe(0)
  })

  it("should handle hunk with alternating add/remove", () => {
    const hunk = createHunk(1, "changes.ts", 0, 10, 10, [
      "-old1",
      "+new1",
      "-old2",
      "+new2",
      "-old3",
      "+new3",
    ])
    
    // Split after first pair
    const subHunk = createSubHunk(hunk, 2, 5)
    expect(subHunk.lines).toEqual(["-old2", "+new2", "-old3", "+new3"])
    
    // After line 0-1: old=1, new=1
    expect(subHunk.oldStart).toBe(11)
    expect(subHunk.newStart).toBe(11)
    expect(subHunk.oldLines).toBe(2) // old2, old3
    expect(subHunk.newLines).toBe(2) // new2, new3
  })

  it("should handle hunk starting with removed lines followed by added", () => {
    const hunk = createHunk(1, "refactor.ts", 0, 5, 5, [
      "-const a = 1",
      "-const b = 2",
      "-const c = 3",
      "+const x = 1",
      "+const y = 2",
    ])
    
    // Split to get only removed lines
    const removedOnly = createSubHunk(hunk, 0, 2)
    expect(removedOnly.oldLines).toBe(3)
    expect(removedOnly.newLines).toBe(0)
    
    // Split to get only added lines
    const addedOnly = createSubHunk(hunk, 3, 4)
    expect(addedOnly.oldLines).toBe(0)
    expect(addedOnly.newLines).toBe(2)
    expect(addedOnly.oldStart).toBe(8) // 5 + 3 removed
    expect(addedOnly.newStart).toBe(5) // same as original since no new lines consumed
  })

  it("should handle large hunk split into many parts", () => {
    const lines: string[] = []
    for (let i = 0; i < 100; i++) {
      if (i % 3 === 0) lines.push(` context${i}`)
      else if (i % 3 === 1) lines.push(`-removed${i}`)
      else lines.push(`+added${i}`)
    }
    
    const hunk = createHunk(1, "large.ts", 0, 1, 1, lines)
    
    // Split into 10 parts
    for (let i = 0; i < 10; i++) {
      const start = i * 10
      const end = start + 9
      const subHunk = createSubHunk(hunk, start, end)
      
      expect(subHunk.lines.length).toBe(10)
      expect(subHunk.rawDiff).toContain("@@")
    }
  })
})

describe("Coverage Tracking", () => {
  const testHunks = [
    createHunk(1, "file1.ts", 0, 1, 1, [" a", "-b", "+c", " d"]),
    createHunk(2, "file2.ts", 0, 10, 10, [" x", " y", " z"]),
    createHunk(3, "file3.ts", 0, 20, 20, ["+new1", "+new2", "+new3", "+new4", "+new5"]),
  ]

  it("should initialize coverage with all hunks unexplained", () => {
    const coverage = initializeCoverage(testHunks)
    
    expect(coverage.totalHunks).toBe(3)
    expect(coverage.unexplainedHunks).toBe(3)
    expect(coverage.partiallyExplainedHunks).toBe(0)
    expect(coverage.fullyExplainedHunks).toBe(0)
  })

  it("should track full hunk coverage", () => {
    const coverage = initializeCoverage(testHunks)
    
    markHunkFullyCovered(coverage, 1)
    
    expect(coverage.fullyExplainedHunks).toBe(1)
    expect(coverage.unexplainedHunks).toBe(2)
  })

  it("should track partial coverage", () => {
    const coverage = initializeCoverage(testHunks)
    
    // Mark only first 2 lines of hunk 3 (which has 5 lines)
    markCovered(coverage, 3, 0, 1)
    
    expect(coverage.partiallyExplainedHunks).toBe(1)
    expect(coverage.fullyExplainedHunks).toBe(0)
    expect(coverage.unexplainedHunks).toBe(2)
  })

  it("should merge overlapping ranges", () => {
    const coverage = initializeCoverage(testHunks)
    
    markCovered(coverage, 3, 0, 2)
    markCovered(coverage, 3, 1, 4)  // overlaps with previous
    
    const hunkCoverage = coverage.hunks.get(3)!
    expect(hunkCoverage.coveredRanges).toEqual([[0, 4]])
    expect(coverage.fullyExplainedHunks).toBe(1)
  })

  it("should merge adjacent ranges", () => {
    const coverage = initializeCoverage(testHunks)
    
    markCovered(coverage, 3, 0, 1)
    markCovered(coverage, 3, 2, 4)  // adjacent to previous
    
    const hunkCoverage = coverage.hunks.get(3)!
    expect(hunkCoverage.coveredRanges).toEqual([[0, 4]])
  })

  it("should update coverage from ReviewGroup with hunkIds", () => {
    const coverage = initializeCoverage(testHunks)
    
    const group: ReviewGroup = {
      hunkIds: [1, 2],
      markdownDescription: "test",
    }
    
    updateCoverageFromGroup(coverage, group)
    
    expect(coverage.fullyExplainedHunks).toBe(2)
    expect(coverage.unexplainedHunks).toBe(1)
  })

  it("should update coverage from ReviewGroup with lineRange (1-based)", () => {
    const coverage = initializeCoverage(testHunks)
    
    // AI sends 1-based line numbers (like cat -n output)
    const group: ReviewGroup = {
      hunkId: 3,
      lineRange: [1, 3],  // 1-based: lines 1-3 = 0-indexed lines 0-2
      markdownDescription: "test",
    }
    
    updateCoverageFromGroup(coverage, group)
    
    expect(coverage.partiallyExplainedHunks).toBe(1)
    expect(coverage.unexplainedHunks).toBe(2)
  })

  it("should get uncovered portions", () => {
    const coverage = initializeCoverage(testHunks)
    
    markHunkFullyCovered(coverage, 1)
    markCovered(coverage, 3, 0, 2)  // cover first 3 of 5 lines
    
    const uncovered = getUncoveredPortions(coverage, testHunks)
    
    expect(uncovered.length).toBe(2)  // hunk 2 and partial of hunk 3
    
    const hunk2Uncovered = uncovered.find(u => u.hunkId === 2)
    expect(hunk2Uncovered).toBeDefined()
    expect(hunk2Uncovered!.uncoveredRanges).toEqual([[0, 2]])
    
    const hunk3Uncovered = uncovered.find(u => u.hunkId === 3)
    expect(hunk3Uncovered).toBeDefined()
    expect(hunk3Uncovered!.uncoveredRanges).toEqual([[3, 4]])
  })

  it("should format uncovered message", () => {
    const coverage = initializeCoverage(testHunks)
    markHunkFullyCovered(coverage, 1)
    
    const uncovered = getUncoveredPortions(coverage, testHunks)
    const message = formatUncoveredMessage(uncovered)
    
    expect(message).toContain("not explained")
    expect(message).toContain("Hunk #2")
    expect(message).toContain("Hunk #3")
    expect(message).not.toContain("Hunk #1")
  })

  it("should return success message when all covered", () => {
    const coverage = initializeCoverage(testHunks)
    markHunkFullyCovered(coverage, 1)
    markHunkFullyCovered(coverage, 2)
    markHunkFullyCovered(coverage, 3)
    
    const uncovered = getUncoveredPortions(coverage, testHunks)
    const message = formatUncoveredMessage(uncovered)
    
    expect(message).toContain("fully explained")
  })
})

describe("buildPatch", () => {
  it("should generate valid unified diff format", () => {
    const patch = buildPatch("test.ts", 10, 10, [
      " context",
      "-removed",
      "+added",
    ])
    
    expect(patch).toContain("--- a/test.ts")
    expect(patch).toContain("+++ b/test.ts")
    expect(patch).toContain("@@ -10,2 +10,2 @@")
  })

  it("should handle only additions", () => {
    const patch = buildPatch("new.ts", 1, 1, [
      "+line1",
      "+line2",
    ])
    
    expect(patch).toContain("@@ -1,0 +1,2 @@")
  })

  it("should handle only deletions", () => {
    const patch = buildPatch("old.ts", 5, 5, [
      "-line1",
      "-line2",
      "-line3",
    ])
    
    expect(patch).toContain("@@ -5,3 +5,0 @@")
  })
})

// ============================================================================
// Patch Parseability Tests - Ensure generated patches are valid unified diff
// ============================================================================

describe("buildPatch parseability", () => {
  function verifyParseable(patch: string): boolean {
    const parsed = parsePatch(patch)
    return parsed.length > 0 && parsed[0]!.hunks.length > 0
  }
  
  it("should generate parseable patch for basic change", () => {
    const patch = buildPatch("test.ts", 10, 10, [
      " context before",
      "-old line",
      "+new line",
      " context after",
    ])
    
    expect(verifyParseable(patch)).toBe(true)
  })

  it("should generate parseable patch for additions only", () => {
    const patch = buildPatch("new.ts", 0, 1, [
      "+line1",
      "+line2",
      "+line3",
    ])
    
    expect(verifyParseable(patch)).toBe(true)
  })

  it("should generate parseable patch for deletions only", () => {
    const patch = buildPatch("old.ts", 1, 0, [
      "-line1",
      "-line2",
      "-line3",
    ])
    
    expect(verifyParseable(patch)).toBe(true)
  })

  it("should generate parseable patch with single line", () => {
    const patch = buildPatch("single.ts", 5, 5, [
      "+only one line",
    ])
    
    expect(verifyParseable(patch)).toBe(true)
  })

  it("should generate parseable patch for new file at line 0", () => {
    // New file - oldStart=0, oldLines=0
    const patch = buildPatch("brand-new.ts", 0, 1, [
      "+export function newFeature() {",
      "+  return true",
      "+}",
    ])
    
    expect(verifyParseable(patch)).toBe(true)
    expect(patch).toContain("@@ -0,0 +1,3 @@")
  })

  it("should generate parseable patch for file deletion", () => {
    // File being deleted - newStart effectively 0, newLines=0
    const patch = buildPatch("deleted.ts", 1, 0, [
      "-export function oldFeature() {",
      "-  return false",
      "-}",
    ])
    
    expect(verifyParseable(patch)).toBe(true)
    expect(patch).toContain("@@ -1,3 +0,0 @@")
  })
})

describe("buildPatch edge cases", () => {
  it("should handle filenames with spaces", () => {
    const patch = buildPatch("my file.ts", 1, 1, [
      " context",
      "-old",
      "+new",
    ])
    
    expect(patch).toContain("--- a/my file.ts")
    expect(patch).toContain("+++ b/my file.ts")
    
    const parsed = parsePatch(patch)
    expect(parsed.length).toBe(1)
  })

  it("should handle filenames with special characters", () => {
    const patch = buildPatch("src/[id]/page.tsx", 5, 5, [
      " export default function Page() {",
      "-  return null",
      "+  return <div>Hello</div>",
      " }",
    ])
    
    const parsed = parsePatch(patch)
    expect(parsed.length).toBe(1)
    expect(parsed[0]!.newFileName).toContain("[id]")
  })

  it("should handle lines that look like diff markers", () => {
    // Content that contains --- or +++ or @@ should still work
    const patch = buildPatch("readme.md", 1, 1, [
      " Some text",
      "-Old separator: ---",
      "+New separator: +++",
      " More text",
    ])
    
    const parsed = parsePatch(patch)
    expect(parsed.length).toBe(1)
    expect(parsed[0]!.hunks[0]!.lines).toHaveLength(4)
  })

  it("should handle empty lines in diff", () => {
    const patch = buildPatch("code.ts", 1, 1, [
      " function foo() {",
      " ",  // empty line as context
      "-  return null",
      "+  return value",
      " ",  // empty line as context
      " }",
    ])
    
    const parsed = parsePatch(patch)
    expect(parsed.length).toBe(1)
    expect(parsed[0]!.hunks[0]!.lines).toHaveLength(6)
  })

  it("should handle many context lines", () => {
    const lines: string[] = []
    // 50 context lines, then one change, then 50 more context
    for (let i = 0; i < 50; i++) {
      lines.push(` context line ${i}`)
    }
    lines.push("-old middle")
    lines.push("+new middle")
    for (let i = 50; i < 100; i++) {
      lines.push(` context line ${i}`)
    }
    
    const patch = buildPatch("large.ts", 1, 1, lines)
    
    const parsed = parsePatch(patch)
    expect(parsed.length).toBe(1)
    expect(parsed[0]!.hunks[0]!.lines).toHaveLength(102)
  })

  it("should handle high line numbers", () => {
    const patch = buildPatch("bigfile.ts", 10000, 10005, [
      " context at line 10000",
      "-removed at 10001",
      "+added new content",
      " context at 10002",
    ])
    
    expect(patch).toContain("@@ -10000,3 +10005,3 @@")
    
    const parsed = parsePatch(patch)
    expect(parsed[0]!.hunks[0]!.oldStart).toBe(10000)
    expect(parsed[0]!.hunks[0]!.newStart).toBe(10005)
  })

  it("should handle unicode in filenames", () => {
    const patch = buildPatch("日本語ファイル.ts", 1, 1, [
      " const greeting = 'こんにちは'",
      "-const old = '古い'",
      "+const new = '新しい'",
    ])
    
    const parsed = parsePatch(patch)
    expect(parsed.length).toBe(1)
  })

  it("should handle unicode in content", () => {
    const patch = buildPatch("i18n.ts", 1, 1, [
      " // Translations",
      "-const msg = 'Hello'",
      "+const msg = '你好世界 🌍'",
      " export { msg }",
    ])
    
    const parsed = parsePatch(patch)
    expect(parsed.length).toBe(1)
    expect(parsed[0]!.hunks[0]!.lines[2]).toContain("你好世界")
  })

  it("should handle tabs in content", () => {
    // Each line must be a single line - no embedded newlines
    const patch = buildPatch("tabs.ts", 1, 1, [
      " function foo() {",
      "-\treturn null",
      "+\treturn value",
      " }",
    ])
    
    const parsed = parsePatch(patch)
    expect(parsed.length).toBe(1)
  })

  it("should handle very long lines", () => {
    const longString = "x".repeat(1000)
    const patch = buildPatch("long.ts", 1, 1, [
      ` const short = 'hi'`,
      `-const old = '${longString}'`,
      `+const new = '${longString}${longString}'`,
    ])
    
    const parsed = parsePatch(patch)
    expect(parsed.length).toBe(1)
  })
})

describe("createSubHunk parseability", () => {
  it("should generate parseable patches for sub-hunks", () => {
    const originalHunk = createHunk(1, "api.ts", 0, 10, 10, [
      " export async function fetch() {",
      "-  const url = '/old'",
      "+  const url = '/new'",
      "+  const timeout = 5000",
      " ",
      "   const response = await request(url)",
      "-  return response.data",
      "+  return response.json()",
      " }",
    ])
    
    // Split into first part (lines 0-4)
    const subHunk1 = createSubHunk(originalHunk, 0, 4)
    
    const parsed1 = parsePatch(subHunk1.rawDiff)
    expect(parsed1.length).toBe(1)
    expect(parsed1[0]!.hunks.length).toBe(1)
    
    // Split into second part (lines 5-8)
    const subHunk2 = createSubHunk(originalHunk, 5, 8)
    
    const parsed2 = parsePatch(subHunk2.rawDiff)
    expect(parsed2.length).toBe(1)
    expect(parsed2[0]!.hunks.length).toBe(1)
  })

  it("should generate correct line numbers for sub-hunks", () => {
    const hunk = createHunk(1, "file.ts", 0, 100, 100, [
      " line 100",      // 0: context
      " line 101",      // 1: context
      "-line 102 old",  // 2: removed
      "+line 102 new",  // 3: added
      " line 103",      // 4: context
      " line 104",      // 5: context
      "-line 105 old",  // 6: removed
      "+line 105 new",  // 7: added
      " line 106",      // 8: context
    ])
    
    // Get second half starting at line 5
    const subHunk = createSubHunk(hunk, 5, 8)
    
    const parsed = parsePatch(subHunk.rawDiff)
    
    // After consuming lines 0-4:
    // line 0: context -> old=1, new=1
    // line 1: context -> old=2, new=2
    // line 2: removed -> old=3, new=2
    // line 3: added -> old=3, new=3
    // line 4: context -> old=4, new=4
    // So at line 5: oldOffset=4, newOffset=4
    expect(parsed[0]!.hunks[0]!.oldStart).toBe(104)  // 100 + 4
    expect(parsed[0]!.hunks[0]!.newStart).toBe(104)  // 100 + 4
  })

  it("should handle sub-hunk with only additions", () => {
    const hunk = createHunk(1, "new.ts", 0, 5, 5, [
      " existing line",
      "+new line 1",
      "+new line 2",
      "+new line 3",
      " another existing",
    ])
    
    // Extract just the additions (lines 1-3)
    const subHunk = createSubHunk(hunk, 1, 3)
    
    expect(subHunk.oldLines).toBe(0)  // no context or removals
    expect(subHunk.newLines).toBe(3)  // 3 additions
    
    const parsed = parsePatch(subHunk.rawDiff)
    expect(parsed.length).toBe(1)
  })

  it("should handle sub-hunk with only removals", () => {
    const hunk = createHunk(1, "old.ts", 0, 10, 10, [
      " keep this",
      "-remove 1",
      "-remove 2",
      "-remove 3",
      " keep this too",
    ])
    
    // Extract just the removals (lines 1-3)
    const subHunk = createSubHunk(hunk, 1, 3)
    
    expect(subHunk.oldLines).toBe(3)  // 3 removals
    expect(subHunk.newLines).toBe(0)  // no context or additions
    
    const parsed = parsePatch(subHunk.rawDiff)
    expect(parsed.length).toBe(1)
  })

  it("should handle sub-hunk at the very start", () => {
    const hunk = createHunk(1, "file.ts", 0, 1, 1, [
      "-first line old",
      "+first line new",
      " second line",
      " third line",
    ])
    
    // Just the first two lines
    const subHunk = createSubHunk(hunk, 0, 1)
    
    expect(subHunk.oldStart).toBe(1)
    expect(subHunk.newStart).toBe(1)
    
    const parsed = parsePatch(subHunk.rawDiff)
    expect(parsed.length).toBe(1)
  })

  it("should handle sub-hunk at the very end", () => {
    const hunk = createHunk(1, "file.ts", 0, 10, 10, [
      " line 10",
      " line 11",
      "-line 12 old",
      "+line 12 new",
    ])
    
    // Just the last two lines
    const subHunk = createSubHunk(hunk, 2, 3)
    
    // After lines 0-1: oldOffset=2, newOffset=2
    expect(subHunk.oldStart).toBe(12)  // 10 + 2
    expect(subHunk.newStart).toBe(12)  // 10 + 2
    
    const parsed = parsePatch(subHunk.rawDiff)
    expect(parsed.length).toBe(1)
  })
})

describe("Edge cases: minimal and boundary conditions", () => {
  it("should handle lines that are just the diff marker", () => {
    // Lines that are just " " or "-" or "+" (minimal content after prefix)
    const patch = buildPatch("minimal.ts", 1, 1, [
      " ",  // context line with just space content (empty line)
      "-",  // removed empty line
      "+",  // added empty line
    ])
    
    const parsed = parsePatch(patch)
    expect(parsed.length).toBe(1)
    expect(parsed[0]!.hunks[0]!.lines).toHaveLength(3)
  })

  it("should handle consecutive removals then additions (replace block)", () => {
    const patch = buildPatch("replace.ts", 10, 10, [
      " before",
      "-old line 1",
      "-old line 2",
      "-old line 3",
      "+new line 1",
      "+new line 2",
      " after",
    ])
    
    const parsed = parsePatch(patch)
    expect(parsed[0]!.hunks[0]!.oldLines).toBe(5)  // 2 context + 3 removed
    expect(parsed[0]!.hunks[0]!.newLines).toBe(4)  // 2 context + 2 added
  })

  it("should handle sub-hunk that starts mid-replacement", () => {
    // Original hunk has: remove3, add3, and we want just the middle
    const hunk = createHunk(1, "file.ts", 0, 1, 1, [
      "-old 1",
      "-old 2",
      "-old 3",
      "+new 1",
      "+new 2",
      "+new 3",
    ])
    
    // Split to get just middle (lines 2-3: last removal and first addition)
    const subHunk = createSubHunk(hunk, 2, 3)
    
    expect(subHunk.lines).toEqual(["-old 3", "+new 1"])
    expect(subHunk.oldLines).toBe(1)
    expect(subHunk.newLines).toBe(1)
    
    const parsed = parsePatch(subHunk.rawDiff)
    expect(parsed.length).toBe(1)
  })

  it("should handle paths with forward slashes", () => {
    const patch = buildPatch("src/components/ui/Button.tsx", 1, 1, [
      " export const Button = () => {",
      "-  return <button>Click</button>",
      "+  return <button className='btn'>Click</button>",
      " }",
    ])
    
    expect(patch).toContain("--- a/src/components/ui/Button.tsx")
    expect(patch).toContain("+++ b/src/components/ui/Button.tsx")
    
    const parsed = parsePatch(patch)
    expect(parsed[0]!.newFileName).toBe("b/src/components/ui/Button.tsx")
  })

  it("should handle dotfiles", () => {
    const patch = buildPatch(".gitignore", 1, 1, [
      " node_modules/",
      "-dist/",
      "+build/",
      "+dist/",
    ])
    
    const parsed = parsePatch(patch)
    expect(parsed[0]!.newFileName).toBe("b/.gitignore")
  })

  it("should handle files with @ in content", () => {
    // @ is used in diff headers, ensure it doesn't confuse parser when in content
    const patch = buildPatch("email.ts", 1, 1, [
      " const emails = [",
      "-  'old@example.com',",
      "+  'new@example.com',",
      "+  'admin@example.com',",
      " ]",
    ])
    
    const parsed = parsePatch(patch)
    expect(parsed[0]!.hunks[0]!.lines[1]).toContain("old@example.com")
    expect(parsed[0]!.hunks[0]!.lines[2]).toContain("new@example.com")
  })
})

describe("Round-trip: parseHunksWithIds produces valid patches", () => {
  it("should produce parseable patches from parseHunksWithIds", async () => {
    const { parseHunksWithIds } = await import("./hunk-parser.js")
    
    // Simulate a real git diff output
    // Context: 4 lines (const x, const y, // end, })
    // Removed: 1 line, Added: 3 lines
    // So: old=5, new=7
    const gitDiff = [
      "diff --git a/src/utils.ts b/src/utils.ts",
      "index abc123..def456 100644",
      "--- a/src/utils.ts",
      "+++ b/src/utils.ts",
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
    
    const hunks = await parseHunksWithIds(gitDiff)
    expect(hunks.length).toBe(1)
    
    // The rawDiff should be parseable
    const parsed = parsePatch(hunks[0]!.rawDiff)
    expect(parsed.length).toBe(1)
    expect(parsed[0]!.hunks.length).toBe(1)
  })

  it("should handle multi-hunk file from parseHunksWithIds", async () => {
    const { parseHunksWithIds } = await import("./hunk-parser.js")
    
    // Hunk 1: 4 context + 1 add = old:4, new:5
    // Hunk 2: 5 context + 1 add = old:5, new:6
    const gitDiff = [
      "diff --git a/src/api.ts b/src/api.ts",
      "--- a/src/api.ts",
      "+++ b/src/api.ts",
      "@@ -1,4 +1,5 @@",
      " import { fetch } from 'node-fetch'",
      "+import { logger } from './logger'",
      " ",
      " export async function getData() {",
      "   const response = await fetch('/api')",
      "@@ -20,5 +21,6 @@ export async function postData(data) {",
      "   const response = await fetch('/api', {",
      "     method: 'POST',",
      "     body: JSON.stringify(data),",
      "+    headers: { 'Content-Type': 'application/json' },",
      "   })",
      "   return response.json()",
    ].join("\n")
    
    const hunks = await parseHunksWithIds(gitDiff)
    expect(hunks.length).toBe(2)
    
    // Both hunks should produce valid patches
    for (const hunk of hunks) {
      const parsed = parsePatch(hunk.rawDiff)
      expect(parsed.length).toBe(1)
      expect(parsed[0]!.hunks.length).toBe(1)
    }
  })

  it("should handle sub-hunks from real parseHunksWithIds output", async () => {
    const { parseHunksWithIds } = await import("./hunk-parser.js")
    
    // 10 context + 4 removed + 6 added = old:14, new:16
    const gitDiff = [
      "diff --git a/large.ts b/large.ts",
      "--- a/large.ts",
      "+++ b/large.ts",
      "@@ -1,14 +1,16 @@",
      " // First section: imports",       // context 1
      " import { a } from 'a'",           // context 2
      "-import { b } from 'b'",           // removed 1
      "+import { b, c } from 'b'",        // added 1
      "+import { d } from 'd'",           // added 2
      " ",                                 // context 3
      " // Second section: constants",    // context 4
      " const X = 1",                      // context 5
      "-const Y = 2",                      // removed 2
      "+const Y = 3",                      // added 3
      "+const Z = 4",                      // added 4
      " ",                                 // context 6
      " // Third section: functions",     // context 7
      " function foo() {",                 // context 8
      "-  return X",                       // removed 3
      "+  return X + Y",                   // added 5
      " }",                                // context 9
      " ",                                 // context 10
      "-function bar() { return Y }",     // removed 4
      "+function bar() { return Y + Z }", // added 6
    ].join("\n")
    
    const hunks = await parseHunksWithIds(gitDiff)
    expect(hunks.length).toBe(1)
    
    const hunk = hunks[0]!
    
    // Split into sections and verify each produces valid patch
    const section1 = createSubHunk(hunk, 0, 4)
    expect(parsePatch(section1.rawDiff).length).toBe(1)
    
    const section2 = createSubHunk(hunk, 5, 10)
    expect(parsePatch(section2.rawDiff).length).toBe(1)
    
    const section3 = createSubHunk(hunk, 11, hunk.lines.length - 1)
    expect(parsePatch(section3.rawDiff).length).toBe(1)
  })
})

describe("Regression: patch format compatibility", () => {
  // These tests verify the format matches what opentui's Diff component expects
  // Note: the `diff` library normalizes 0 to 1 when parsing, so we test the raw string
  
  it("should match opentui expected format for simple change", () => {
    const patch = buildPatch("test.js", 1, 1, [
      " function hello() {",
      '-  console.log("Hello");',
      '+  console.log("Hello, World!");',
      " }",
    ])
    
    // This format should match what opentui tests expect
    expect(patch).toContain("--- a/test.js")
    expect(patch).toContain("+++ b/test.js")
    expect(patch).toMatch(/@@ -1,\d+ \+1,\d+ @@/)
    
    const parsed = parsePatch(patch)
    expect(parsed[0]!.hunks[0]!.oldStart).toBe(1)
    expect(parsed[0]!.hunks[0]!.newStart).toBe(1)
  })

  it("should match opentui expected format for new file (add-only)", () => {
    // opentui tests show: @@ -0,0 +1,3 @@
    const patch = buildPatch("new.js", 0, 1, [
      "+function newFunction() {",
      "+  return true;",
      "+}",
    ])
    
    // Verify raw string format
    expect(patch).toContain("@@ -0,0 +1,3 @@")
    
    // diff library normalizes 0 -> 1 when parsing, but the raw format is correct
    const parsed = parsePatch(patch)
    expect(parsed[0]!.hunks[0]!.oldLines).toBe(0)
    expect(parsed[0]!.hunks[0]!.newLines).toBe(3)
  })

  it("should match opentui expected format for deleted file (remove-only)", () => {
    // opentui tests show: @@ -1,3 +0,0 @@
    const patch = buildPatch("old.js", 1, 0, [
      "-function oldFunction() {",
      "-  return false;",
      "-}",
    ])
    
    // Verify raw string format
    expect(patch).toContain("@@ -1,3 +0,0 @@")
    
    // diff library normalizes 0 -> 1 when parsing, but the raw format is correct
    const parsed = parsePatch(patch)
    expect(parsed[0]!.hunks[0]!.oldLines).toBe(3)
    expect(parsed[0]!.hunks[0]!.newLines).toBe(0)
  })

  it("should handle the large diff format from opentui tests", () => {
    // From opentui Diff.test.ts - large diff starting at line 42
    const patch = buildPatch("large.js", 42, 42, [
      " const line42 = 'context';",
      " const line43 = 'context';",
      "-const line44 = 'removed';",
      "+const line44 = 'added';",
      " const line45 = 'context';",
      "+const line46 = 'added';",
      " const line47 = 'context';",
      " const line48 = 'context';",
      "-const line49 = 'removed';",
      "+const line49 = 'changed';",
      " const line50 = 'context';",
      " const line51 = 'context';",
    ])
    
    const parsed = parsePatch(patch)
    
    expect(parsed[0]!.hunks[0]!.oldStart).toBe(42)
    expect(parsed[0]!.hunks[0]!.newStart).toBe(42)
    // old: 7 context + 2 removed = 9
    // new: 7 context + 3 added = 10
    expect(parsed[0]!.hunks[0]!.oldLines).toBe(9)
    expect(parsed[0]!.hunks[0]!.newLines).toBe(10)
  })
})

// ============================================================================
// combineHunkPatches Tests
// ============================================================================

describe("combineHunkPatches", () => {
  it("should return empty string for empty array", () => {
    expect(combineHunkPatches([])).toBe("")
  })

  it("should return rawDiff unchanged for a single hunk", () => {
    const hunk = createHunk(1, "src/file.ts", 0, 10, 10, [
      " context",
      "-old",
      "+new",
    ])

    expect(combineHunkPatches([hunk])).toBe(hunk.rawDiff)
  })

  it("should combine two hunks from the same file under one header", () => {
    const hunk1 = createHunk(1, "src/file.ts", 0, 10, 10, [
      " context",
      "-old line 1",
      "+new line 1",
      " context",
    ])
    const hunk2 = createHunk(2, "src/file.ts", 1, 50, 50, [
      " context",
      "-old line 2",
      "+new line 2",
      " context",
    ])

    const combined = combineHunkPatches([hunk1, hunk2])

    // Should contain a single file header
    const headerMatches = combined.match(/diff --git/g) || []
    expect(headerMatches.length).toBe(1)

    // Should contain two @@ sections
    const hunkMatches = combined.match(/^@@/gm) || []
    expect(hunkMatches.length).toBe(2)

    // Should be parseable by the diff library
    const parsed = parsePatch(combined)
    expect(parsed.length).toBe(1)
    expect(parsed[0]!.hunks.length).toBe(2)
    expect(parsed[0]!.hunks[0]!.oldStart).toBe(10)
    expect(parsed[0]!.hunks[1]!.oldStart).toBe(50)
  })

  it("should sort same-file hunks by oldStart", () => {
    // Pass hunks in reverse order — combineHunkPatches should sort them
    const hunkLater = createHunk(1, "src/file.ts", 0, 100, 100, [
      " context",
      "-old",
      "+new",
    ])
    const hunkEarlier = createHunk(2, "src/file.ts", 1, 10, 10, [
      " context",
      "-old",
      "+new",
    ])

    const combined = combineHunkPatches([hunkLater, hunkEarlier])

    const parsed = parsePatch(combined)
    expect(parsed[0]!.hunks[0]!.oldStart).toBe(10)
    expect(parsed[0]!.hunks[1]!.oldStart).toBe(100)
  })

  it("should keep hunks from different files as separate sections", () => {
    const hunkA = createHunk(1, "src/a.ts", 0, 5, 5, [
      " context",
      "-old a",
      "+new a",
    ])
    const hunkB = createHunk(2, "src/b.ts", 0, 10, 10, [
      " context",
      "-old b",
      "+new b",
    ])

    const combined = combineHunkPatches([hunkA, hunkB])

    // Should contain two file headers
    const headerMatches = combined.match(/diff --git/g) || []
    expect(headerMatches.length).toBe(2)

    // Each should be parseable
    const parsed = parsePatch(combined)
    expect(parsed.length).toBe(2)
    expect(parsed[0]!.hunks.length).toBe(1)
    expect(parsed[1]!.hunks.length).toBe(1)
  })

  it("should handle a mix of same-file and different-file hunks", () => {
    const hunk1 = createHunk(1, "src/a.ts", 0, 5, 5, [
      " ctx",
      "-old1",
      "+new1",
    ])
    const hunk2 = createHunk(2, "src/a.ts", 1, 50, 50, [
      " ctx",
      "-old2",
      "+new2",
    ])
    const hunk3 = createHunk(3, "src/b.ts", 0, 10, 10, [
      " ctx",
      "+added",
    ])

    const combined = combineHunkPatches([hunk1, hunk2, hunk3])

    const parsed = parsePatch(combined)
    // Two files: a.ts with 2 hunks, b.ts with 1 hunk
    expect(parsed.length).toBe(2)

    const fileA = parsed.find(p => p.oldFileName?.includes("a.ts"))
    const fileB = parsed.find(p => p.oldFileName?.includes("b.ts"))
    expect(fileA!.hunks.length).toBe(2)
    expect(fileB!.hunks.length).toBe(1)
  })

  it("should produce valid patches for the exact bug scenario (line-shift)", () => {
    // Simulate the original bug: two hunks in the same file where the first
    // adds 2 lines, shifting the second hunk's position
    const hunk1 = createHunk(1, "src/cli.tsx", 0, 100, 100, [
      " const a = 1",
      "-const b = 2",
      "+const b = 2 // updated",
      "+const b2 = 2.5 // new line",
      " const c = 3",
    ])
    const hunk2 = createHunk(2, "src/cli.tsx", 1, 200, 200, [
      " function foo() {",
      "-  return null",
      "+  return value",
      "+  // extra line",
      " }",
    ])

    const combined = combineHunkPatches([hunk1, hunk2])

    // Both hunks should be in one parseable patch with original line numbers
    const parsed = parsePatch(combined)
    expect(parsed.length).toBe(1)
    expect(parsed[0]!.hunks.length).toBe(2)
    expect(parsed[0]!.hunks[0]!.oldStart).toBe(100)
    expect(parsed[0]!.hunks[1]!.oldStart).toBe(200)
  })

  it("should handle three hunks from the same file", () => {
    const hunks = [
      createHunk(1, "src/main.ts", 0, 10, 10, [" ctx", "-a", "+b"]),
      createHunk(2, "src/main.ts", 1, 50, 50, [" ctx", "-c", "+d"]),
      createHunk(3, "src/main.ts", 2, 100, 100, [" ctx", "-e", "+f"]),
    ]

    const combined = combineHunkPatches(hunks)

    const parsed = parsePatch(combined)
    expect(parsed.length).toBe(1)
    expect(parsed[0]!.hunks.length).toBe(3)
  })

  it("should preserve diff content exactly", () => {
    const lines1 = [" function hello() {", '-  console.log("hi")', '+  console.log("hello")', " }"]
    const lines2 = [" function bye() {", '-  console.log("bye")', '+  console.log("goodbye")', " }"]

    const hunk1 = createHunk(1, "greet.ts", 0, 1, 1, lines1)
    const hunk2 = createHunk(2, "greet.ts", 1, 20, 20, lines2)

    const combined = combineHunkPatches([hunk1, hunk2])

    // All original content lines should be present
    for (const line of [...lines1, ...lines2]) {
      expect(combined).toContain(line)
    }
  })
})

describe("combineHunkPatches with formatPatch-style rawDiff", () => {
  it("should handle rawDiff from parseHunksWithIds (Index: header format)", async () => {
    const { parseHunksWithIds } = await import("./hunk-parser.js")

    const gitDiff = [
      "diff --git a/src/api.ts b/src/api.ts",
      "--- a/src/api.ts",
      "+++ b/src/api.ts",
      "@@ -1,4 +1,5 @@",
      " import { fetch } from 'node-fetch'",
      "+import { logger } from './logger'",
      " ",
      " export async function getData() {",
      "   const response = await fetch('/api')",
      "@@ -20,5 +21,6 @@ export async function postData(data) {",
      "   const response = await fetch('/api', {",
      "     method: 'POST',",
      "     body: JSON.stringify(data),",
      "+    headers: { 'Content-Type': 'application/json' },",
      "   })",
      "   return response.json()",
    ].join("\n")

    const hunks = await parseHunksWithIds(gitDiff)
    expect(hunks.length).toBe(2)

    // Combine both hunks — this is the real-world scenario
    const combined = combineHunkPatches(hunks)

    // Should produce a parseable patch with both @@ sections
    const parsed = parsePatch(combined)
    expect(parsed.length).toBe(1)
    expect(parsed[0]!.hunks.length).toBe(2)
    expect(parsed[0]!.hunks[0]!.oldStart).toBe(1)
    expect(parsed[0]!.hunks[1]!.oldStart).toBe(20)
  })
})
