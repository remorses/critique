// Types for the AI-powered diff review feature

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
  hunks: ReviewGroup[]
}

/**
 * A group of related hunks with a description
 */
export interface ReviewGroup {
  hunkIds: number[]
  markdownDescription: string
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
  updatedAt?: string
}

/**
 * Collected session content during load
 */
export interface SessionContent {
  sessionId: string
  notifications: SessionNotification[]
}
