// Parse git diff into indexed hunks for AI review

import type { IndexedHunk } from "./types.ts"

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
 * Convert indexed hunks to XML context for the AI prompt
 */
export function hunksToContextXml(hunks: IndexedHunk[]): string {
  const lines: string[] = []

  for (const hunk of hunks) {
    lines.push(`<hunk id="${hunk.id}" file="${hunk.filename}" lines="${hunk.oldStart}-${hunk.oldStart + hunk.oldLines}">`)
    lines.push(hunk.rawDiff.trim())
    lines.push("</hunk>")
    lines.push("")
  }

  return lines.join("\n")
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
