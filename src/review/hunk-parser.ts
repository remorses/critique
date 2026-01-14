// Parse git diff into indexed hunks for AI review

import type { IndexedHunk, HunkCoverage, ReviewCoverage, UncoveredPortion, ReviewGroup } from "./types.ts"
import { IGNORED_FILES } from "../diff-utils.ts"

/**
 * Additional patterns for auto-generated files that should be skipped in reviews
 * These are files that provide no value in code review
 */
const AUTO_GENERATED_PATTERNS = [
  // Common generated file markers
  /\.generated\.(ts|js|tsx|jsx)$/,
  /\.g\.(ts|js)$/,
  // Build outputs and compiled files
  /\.min\.(js|css)$/,
  /\.bundle\.(js|css)$/,
  // Source maps
  /\.map$/,
  // Type declarations that are generated
  /\.d\.ts$/,  // Often auto-generated, skip by default
  // Database migrations with timestamps (auto-generated structure)
  /migrations\/\d{10,}.*\.(sql|ts|js)$/,
  // Snapshot files (test artifacts)
  /__snapshots__\//,
  /\.snap$/,
]

/**
 * Check if a file should be skipped in review
 * Returns true for lock files and auto-generated files
 */
function shouldSkipFile(filename: string): boolean {
  const baseName = filename.split("/").pop() || ""
  
  // Check against ignored files list (lockfiles)
  if (IGNORED_FILES.includes(baseName) || baseName.endsWith(".lock")) {
    return true
  }
  
  // Check auto-generated patterns
  for (const pattern of AUTO_GENERATED_PATTERNS) {
    if (pattern.test(filename)) {
      return true
    }
  }
  
  return false
}

/**
 * Parse a git diff string into an array of indexed hunks
 * Each hunk gets a unique incremental ID across all files
 */
export async function parseHunksWithIds(gitDiff: string): Promise<IndexedHunk[]> {
  const { parsePatch, formatPatch } = await import("diff")
  const files = parsePatch(gitDiff)
  const hunks: IndexedHunk[] = []
  let nextId = 1

  for (const file of files) {
    const filename = file.newFileName && file.newFileName !== "/dev/null"
      ? file.newFileName
      : file.oldFileName || "unknown"

    // Skip lockfiles and auto-generated files - they add noise without insight
    if (shouldSkipFile(filename)) {
      continue
    }

    for (let hunkIndex = 0; hunkIndex < file.hunks.length; hunkIndex++) {
      const hunk = file.hunks[hunkIndex]!

      // Create a single-hunk file structure for formatPatch
      const singleHunkFile = {
        ...file,
        hunks: [hunk],
      }
      const rawDiff = formatPatch(singleHunkFile)

      hunks.push({
        id: nextId++,
        filename,
        hunkIndex,
        oldStart: hunk.oldStart,
        oldLines: hunk.oldLines,
        newStart: hunk.newStart,
        newLines: hunk.newLines,
        lines: hunk.lines,
        rawDiff,
      })
    }
  }

  return hunks
}

/**
 * Get a map of hunk IDs to hunks for quick lookup
 */
export function createHunkMap(hunks: IndexedHunk[]): Map<number, IndexedHunk> {
  return new Map(hunks.map(h => [h.id, h]))
}

/**
 * Build a valid unified diff patch string from lines
 * 
 * This function generates a valid patch that can be parsed by diff libraries.
 * Works for both full hunks and partial/split hunks.
 * 
 * @param filename - The file path (without a/ or b/ prefix)
 * @param oldStart - Starting line number in the old file
 * @param newStart - Starting line number in the new file
 * @param lines - Array of diff lines with prefix: ' ' (context), '-' (removed), '+' (added)
 */
export function buildPatch(
  filename: string,
  oldStart: number,
  newStart: number,
  lines: string[],
): string {
  // Calculate line counts from the lines array
  let oldLines = 0
  let newLines = 0

  for (const line of lines) {
    const prefix = line[0]
    if (prefix === " ") {
      // Context line - counts for both old and new
      oldLines++
      newLines++
    } else if (prefix === "-") {
      // Removed line - counts for old only
      oldLines++
    } else if (prefix === "+") {
      // Added line - counts for new only
      newLines++
    }
    // Skip lines without valid prefix (shouldn't happen in valid diff)
  }

  // Build the unified diff format
  const header = `--- a/${filename}
+++ b/${filename}
@@ -${oldStart},${oldLines} +${newStart},${newLines} @@`

  return `${header}\n${lines.join("\n")}`
}

/**
 * Create an IndexedHunk from basic parameters
 * Useful for testing and for future hunk splitting feature
 */
export function createHunk(
  id: number,
  filename: string,
  hunkIndex: number,
  oldStart: number,
  newStart: number,
  lines: string[],
): IndexedHunk {
  // Calculate line counts
  let oldLines = 0
  let newLines = 0

  for (const line of lines) {
    const prefix = line[0]
    if (prefix === " ") {
      oldLines++
      newLines++
    } else if (prefix === "-") {
      oldLines++
    } else if (prefix === "+") {
      newLines++
    }
  }

  return {
    id,
    filename,
    hunkIndex,
    oldStart,
    oldLines,
    newStart,
    newLines,
    lines,
    rawDiff: buildPatch(filename, oldStart, newStart, lines),
  }
}

/**
 * Calculate the line number offsets up to a given index in the lines array
 * 
 * This is used to determine where a sub-hunk should start after splitting.
 * 
 * @param lines - Array of diff lines with prefix
 * @param upToIndex - Calculate offsets for lines 0 to upToIndex-1
 * @returns The number of old and new file lines consumed
 */
export function calculateLineOffsets(
  lines: string[],
  upToIndex: number,
): { oldOffset: number; newOffset: number } {
  let oldOffset = 0
  let newOffset = 0

  for (let i = 0; i < upToIndex && i < lines.length; i++) {
    const prefix = lines[i]?.[0]
    if (prefix === " ") {
      // Context line - advances both old and new
      oldOffset++
      newOffset++
    } else if (prefix === "-") {
      // Removed line - only advances old
      oldOffset++
    } else if (prefix === "+") {
      // Added line - only advances new
      newOffset++
    }
  }

  return { oldOffset, newOffset }
}

/**
 * Create a sub-hunk from a portion of an existing hunk
 * 
 * This is the key function for hunk splitting. It extracts a range of lines
 * from an existing hunk and creates a new valid hunk with correct line numbers.
 * 
 * @param originalHunk - The original hunk to split
 * @param startLine - Starting line index (0-based, inclusive)
 * @param endLine - Ending line index (0-based, inclusive)
 * @returns A new IndexedHunk for the specified line range
 */
export function createSubHunk(
  originalHunk: IndexedHunk,
  startLine: number,
  endLine: number,
): IndexedHunk {
  // Validate range
  if (startLine < 0) startLine = 0
  if (endLine >= originalHunk.lines.length) endLine = originalHunk.lines.length - 1
  if (startLine > endLine) {
    throw new Error(`Invalid line range: start ${startLine} > end ${endLine}`)
  }

  // Extract the subset of lines
  const subLines = originalHunk.lines.slice(startLine, endLine + 1)

  // Calculate where this sub-hunk starts in the file
  const { oldOffset, newOffset } = calculateLineOffsets(originalHunk.lines, startLine)

  const newOldStart = originalHunk.oldStart + oldOffset
  const newNewStart = originalHunk.newStart + newOffset

  // Calculate line counts for the sub-hunk
  let oldLines = 0
  let newLines = 0
  for (const line of subLines) {
    const prefix = line[0]
    if (prefix === " ") {
      oldLines++
      newLines++
    } else if (prefix === "-") {
      oldLines++
    } else if (prefix === "+") {
      newLines++
    }
  }

  // Create the sub-hunk (keep same id but mark it's a partial)
  return {
    id: originalHunk.id,
    filename: originalHunk.filename,
    hunkIndex: originalHunk.hunkIndex,
    oldStart: newOldStart,
    oldLines,
    newStart: newNewStart,
    newLines,
    lines: subLines,
    rawDiff: buildPatch(originalHunk.filename, newOldStart, newNewStart, subLines),
  }
}

/**
 * Convert indexed hunks to XML context for the AI prompt
 * Lines are numbered using cat -n format (starting at 1) to enable line range references
 */
export function hunksToContextXml(hunks: IndexedHunk[]): string {
  const output: string[] = []

  for (const hunk of hunks) {
    output.push(`<hunk id="${hunk.id}" file="${hunk.filename}" totalLines="${hunk.lines.length}">`)
    
    // Format lines like cat -n: right-aligned line numbers starting at 1, followed by tab and content
    const maxLineNumWidth = String(hunk.lines.length).length
    hunk.lines.forEach((line, idx) => {
      const lineNum = String(idx + 1).padStart(maxLineNumWidth, " ")
      output.push(`${lineNum}\t${line}`)
    })
    
    output.push("</hunk>")
    output.push("")
  }

  return output.join("\n")
}

// ============================================================================
// Coverage Tracking
// ============================================================================

/**
 * Initialize coverage tracking for a set of hunks
 */
export function initializeCoverage(hunks: IndexedHunk[]): ReviewCoverage {
  const hunkCoverages = new Map<number, HunkCoverage>()

  for (const hunk of hunks) {
    hunkCoverages.set(hunk.id, {
      hunkId: hunk.id,
      totalLines: hunk.lines.length,
      coveredRanges: [],
    })
  }

  return {
    hunks: hunkCoverages,
    totalHunks: hunks.length,
    fullyExplainedHunks: 0,
    partiallyExplainedHunks: 0,
    unexplainedHunks: hunks.length,
  }
}

/**
 * Mark a range of lines as covered in a hunk
 */
export function markCovered(
  coverage: ReviewCoverage,
  hunkId: number,
  startLine: number,
  endLine: number,
): void {
  const hunkCoverage = coverage.hunks.get(hunkId)
  if (!hunkCoverage) return

  // Add the new range
  hunkCoverage.coveredRanges.push([startLine, endLine])

  // Merge overlapping ranges
  hunkCoverage.coveredRanges = mergeRanges(hunkCoverage.coveredRanges)

  // Update overall coverage stats
  updateCoverageStats(coverage)
}

/**
 * Mark an entire hunk as covered
 */
export function markHunkFullyCovered(
  coverage: ReviewCoverage,
  hunkId: number,
): void {
  const hunkCoverage = coverage.hunks.get(hunkId)
  if (!hunkCoverage) return

  markCovered(coverage, hunkId, 0, hunkCoverage.totalLines - 1)
}

/**
 * Update coverage from a ReviewGroup
 * Note: lineRange from AI uses 1-based line numbers (like cat -n), converted to 0-based internally
 */
export function updateCoverageFromGroup(
  coverage: ReviewCoverage,
  group: ReviewGroup,
): void {
  // Handle hunkIds (full hunks)
  if (group.hunkIds) {
    for (const hunkId of group.hunkIds) {
      markHunkFullyCovered(coverage, hunkId)
    }
  }

  // Handle single hunkId with optional lineRange
  if (group.hunkId !== undefined) {
    if (group.lineRange) {
      // Convert from 1-based (AI/cat -n format) to 0-based (internal)
      const startLine = group.lineRange[0] - 1
      const endLine = group.lineRange[1] - 1
      markCovered(coverage, group.hunkId, startLine, endLine)
    } else {
      markHunkFullyCovered(coverage, group.hunkId)
    }
  }
}

/**
 * Merge overlapping or adjacent ranges
 */
function mergeRanges(ranges: [number, number][]): [number, number][] {
  if (ranges.length <= 1) return ranges

  // Sort by start
  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = [sorted[0]!]

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!
    const last = merged[merged.length - 1]!

    // Check if ranges overlap or are adjacent
    if (current[0] <= last[1] + 1) {
      // Merge by extending the last range
      last[1] = Math.max(last[1], current[1])
    } else {
      // No overlap, add as new range
      merged.push(current)
    }
  }

  return merged
}

/**
 * Update the overall coverage statistics
 */
function updateCoverageStats(coverage: ReviewCoverage): void {
  let fullyExplained = 0
  let partiallyExplained = 0
  let unexplained = 0

  for (const hunkCoverage of coverage.hunks.values()) {
    const coveredLines = calculateCoveredLines(hunkCoverage.coveredRanges)

    if (coveredLines === 0) {
      unexplained++
    } else if (coveredLines >= hunkCoverage.totalLines) {
      fullyExplained++
    } else {
      partiallyExplained++
    }
  }

  coverage.fullyExplainedHunks = fullyExplained
  coverage.partiallyExplainedHunks = partiallyExplained
  coverage.unexplainedHunks = unexplained
}

/**
 * Calculate total covered lines from ranges
 */
function calculateCoveredLines(ranges: [number, number][]): number {
  let total = 0
  for (const [start, end] of ranges) {
    total += end - start + 1
  }
  return total
}

/**
 * Get uncovered portions of all hunks
 */
export function getUncoveredPortions(
  coverage: ReviewCoverage,
  hunks: IndexedHunk[],
): UncoveredPortion[] {
  const uncovered: UncoveredPortion[] = []

  for (const hunk of hunks) {
    const hunkCoverage = coverage.hunks.get(hunk.id)
    if (!hunkCoverage) continue

    const uncoveredRanges = getUncoveredRanges(
      hunkCoverage.coveredRanges,
      hunkCoverage.totalLines,
    )

    if (uncoveredRanges.length > 0) {
      const totalUncoveredLines = calculateCoveredLines(uncoveredRanges)
      uncovered.push({
        hunkId: hunk.id,
        filename: hunk.filename,
        uncoveredRanges,
        totalUncoveredLines,
      })
    }
  }

  return uncovered
}

/**
 * Get uncovered ranges given covered ranges and total lines
 */
function getUncoveredRanges(
  coveredRanges: [number, number][],
  totalLines: number,
): [number, number][] {
  if (totalLines === 0) return []
  if (coveredRanges.length === 0) return [[0, totalLines - 1]]

  const merged = mergeRanges(coveredRanges)
  const uncovered: [number, number][] = []

  let currentStart = 0

  for (const [start, end] of merged) {
    if (currentStart < start) {
      uncovered.push([currentStart, start - 1])
    }
    currentStart = end + 1
  }

  // Check if there's uncovered space at the end
  if (currentStart < totalLines) {
    uncovered.push([currentStart, totalLines - 1])
  }

  return uncovered
}

/**
 * Format uncovered portions as a human-readable message
 */
export function formatUncoveredMessage(
  uncovered: UncoveredPortion[],
): string {
  if (uncovered.length === 0) {
    return "All hunks have been fully explained."
  }

  const lines: string[] = ["The following portions were not explained:"]
  
  for (const portion of uncovered) {
    const rangeStr = portion.uncoveredRanges
      .map(([start, end]) => start === end ? `line ${start}` : `lines ${start}-${end}`)
      .join(", ")
    
    lines.push(`  - Hunk #${portion.hunkId} (${portion.filename}): ${rangeStr}`)
  }

  return lines.join("\n")
}
