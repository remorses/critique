// Comprehensive tests for hunk splitting and coverage tracking

import { describe, expect, it } from "bun:test"
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
} from "./hunk-parser.ts"
import type { ReviewGroup } from "./types.ts"

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
