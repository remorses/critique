// Type definitions for the AI-powered diff review feature.
// Defines IndexedHunk, ReviewYaml, ReviewGroup structures for diff analysis,
// plus coverage tracking and session context types for ACP integration.

import type { SessionNotification } from "@agentclientprotocol/sdk"

/**
 * A single hunk from the diff with a unique identifier
 */
export interface IndexedHunk {
  id: number
  filename: string
  hunkIndex: number // which hunk in the file (0-based)
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
  rawDiff: string
}

/**
 * The YAML output structure from the AI review
 */
export interface ReviewYaml {
  title?: string // AI-generated title summarizing the changes
  hunks: ReviewGroup[]
}

/**
 * A group of related hunks with a description
 * Supports both full hunks and partial hunks (line ranges)
 */
export interface ReviewGroup {
  // Option 1: Multiple full hunks (backwards compatible)
  hunkIds?: number[]
  // Option 2: Single hunk with optional line range
  hunkId?: number
  lineRange?: [number, number] // [startLine, endLine] inclusive, 0-based
  // The markdown description for this group
  markdownDescription: string
}

/**
 * Resolved hunk reference - either a full hunk or a partial hunk
 */
export interface ResolvedHunk {
  hunk: IndexedHunk
  lineRange?: [number, number] // if set, only show these lines
  isPartial: boolean
}

/**
 * Coverage tracking for hunks
 * Tracks which lines of each hunk have been explained by the AI
 */
export interface HunkCoverage {
  hunkId: number
  totalLines: number
  coveredRanges: [number, number][] // list of [start, end] ranges that have been covered
}

/**
 * Overall coverage state for the review
 */
export interface ReviewCoverage {
  hunks: Map<number, HunkCoverage>
  totalHunks: number
  fullyExplainedHunks: number
  partiallyExplainedHunks: number
  unexplainedHunks: number
}

/**
 * Uncovered portion of a hunk
 */
export interface UncoveredPortion {
  hunkId: number
  filename: string
  uncoveredRanges: [number, number][]
  totalUncoveredLines: number
}

/**
 * A compressed representation of an ACP session
 */
export interface CompressedSession {
  sessionId: string
  title?: string
  summary: string // compressed text representation of session activity
}

/**
 * Session info from ACP list sessions
 */
export interface SessionInfo {
  sessionId: string
  cwd: string
  title?: string
  updatedAt?: number
  _meta?: { [key: string]: unknown } | null
}

/**
 * Collected session content during load
 */
export interface SessionContent {
  sessionId: string
  notifications: SessionNotification[]
}
