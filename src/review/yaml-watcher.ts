// Watch and parse streaming YAML output from AI review

import fs from "fs"
import YAML from "js-yaml"
import type { ReviewYaml, ReviewGroup } from "./types.ts"

/**
 * Watch a YAML file for changes and parse it as it updates
 * Returns a cleanup function to stop watching
 */
export function watchReviewYaml(
  path: string,
  onUpdate: (yaml: ReviewYaml) => void,
  onError?: (error: Error) => void,
): () => void {
  let lastContent = ""
  let debounceTimeout: ReturnType<typeof setTimeout> | null = null

  // Ensure file exists
  if (!fs.existsSync(path)) {
    fs.writeFileSync(path, "")
  }

  const parseAndUpdate = () => {
    try {
      const content = fs.readFileSync(path, "utf-8")

      // Skip if content hasn't changed
      if (content === lastContent) {
        return
      }
      lastContent = content

      // Skip empty content
      if (!content.trim()) {
        return
      }

      // Try to parse the YAML
      const parsed = parsePartialYaml(content)
      if (parsed) {
        onUpdate(parsed)
      }
    } catch (error) {
      if (onError && error instanceof Error) {
        onError(error)
      }
    }
  }

  // Set up file watcher
  const watcher = fs.watch(path, (eventType) => {
    if (eventType === "change") {
      // Debounce rapid changes
      if (debounceTimeout) {
        clearTimeout(debounceTimeout)
      }
      debounceTimeout = setTimeout(parseAndUpdate, 100)
    }
  })

  // Also poll periodically in case watch events are missed
  const pollInterval = setInterval(parseAndUpdate, 500)

  // Initial parse
  parseAndUpdate()

  // Return cleanup function
  return () => {
    watcher.close()
    clearInterval(pollInterval)
    if (debounceTimeout) {
      clearTimeout(debounceTimeout)
    }
  }
}

/**
 * Parse potentially incomplete YAML content
 * Simply tries to parse - if it fails, the file isn't ready yet
 */
function parsePartialYaml(content: string): ReviewYaml | null {
  // Remove markdown code fences if present
  content = content.replace(/^```ya?ml\s*\n?/gm, "").replace(/\n?```\s*$/gm, "")

  if (!content.trim()) {
    return null
  }

  try {
    const parsed = YAML.load(content) as Record<string, unknown> | null

    if (!parsed || typeof parsed !== "object") {
      return null
    }

    // Validate structure
    const result: ReviewYaml = { hunks: [] }

    if (Array.isArray(parsed.hunks)) {
      for (const item of parsed.hunks) {
        if (isValidReviewGroup(item)) {
          const group: ReviewGroup = {
            markdownDescription: dedentDescription(String(item.markdownDescription || "")),
          }
          
          // Support both formats
          if (item.hunkIds) {
            group.hunkIds = item.hunkIds
          }
          if (item.hunkId !== undefined) {
            group.hunkId = item.hunkId
          }
          if (item.lineRange) {
            group.lineRange = item.lineRange
          }
          
          result.hunks.push(group)
        }
      }
    }

    return result
  } catch {
    // YAML parsing failed - file probably not ready yet, ignore
    return null
  }
}

/**
 * Remove leading indentation from description text
 */
function dedentDescription(text: string): string {
  const lines = text.split("\n")
  if (lines.length === 0) return text

  // Find minimum indentation (ignoring empty lines)
  let minIndent = Infinity
  for (const line of lines) {
    if (line.trim()) {
      const indent = line.match(/^\s*/)?.[0].length || 0
      minIndent = Math.min(minIndent, indent)
    }
  }

  if (minIndent === Infinity || minIndent === 0) {
    return text.trim()
  }

  // Remove that indentation from all lines
  return lines.map((line) => line.slice(minIndent)).join("\n").trim()
}

/**
 * Validate that an object is a valid ReviewGroup
 * Supports two formats:
 * 1. hunkIds: [1, 2, 3] - multiple full hunks
 * 2. hunkId: 1, lineRange: [0, 5] - single hunk with optional line range
 */
function isValidReviewGroup(obj: unknown): obj is ReviewGroup {
  if (!obj || typeof obj !== "object") return false
  const o = obj as Record<string, unknown>
  
  // Must have some form of hunk reference
  const hasHunkIds = Array.isArray(o.hunkIds) && o.hunkIds.every((id: unknown) => typeof id === "number")
  const hasSingleHunkId = typeof o.hunkId === "number"
  
  if (!hasHunkIds && !hasSingleHunkId) {
    return false
  }
  
  // If lineRange is present, it must be a valid tuple
  if (o.lineRange !== undefined) {
    if (!Array.isArray(o.lineRange) || o.lineRange.length !== 2) {
      return false
    }
    if (typeof o.lineRange[0] !== "number" || typeof o.lineRange[1] !== "number") {
      return false
    }
  }
  
  // markdownDescription is optional but if present must be a string
  if (o.markdownDescription !== undefined && typeof o.markdownDescription !== "string") {
    return false
  }
  
  return true
}

/**
 * Read and parse the final YAML file
 */
export function readReviewYaml(path: string): ReviewYaml | null {
  try {
    const content = fs.readFileSync(path, "utf-8")
    return parsePartialYaml(content)
  } catch {
    return null
  }
}
