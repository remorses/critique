// Persistent storage for review sessions in ~/.critique/reviews/.
// Saves review state on exit/completion, enables resume of interrupted reviews,
// and provides listing with automatic cleanup of old reviews (max 50).

import fs from "fs"
import { join } from "path"
import { homedir } from "os"
import type { IndexedHunk, ReviewYaml } from "./types.js"

const REVIEWS_DIR = join(homedir(), ".critique", "reviews")
const MAX_REVIEWS = 50

/**
 * Review status
 * - in_progress: generation was interrupted (CLI exit, crash, Ctrl+C)
 * - completed: generation finished successfully
 */
export type ReviewStatus = "in_progress" | "completed"

/**
 * A stored review session
 * ID is the ACP session ID - used for session/resume
 */
export interface StoredReview {
  id: string // ACP session ID
  createdAt: number
  updatedAt: number
  status: ReviewStatus
  cwd: string
  agent: "opencode" | "claude"
  title: string
  hunks: IndexedHunk[]
  reviewYaml: ReviewYaml
}

/**
 * Metadata for listing reviews (without full content)
 */
export interface ReviewMetadata {
  id: string
  createdAt: number
  updatedAt: number
  status: ReviewStatus
  cwd: string
  title: string
  agent: "opencode" | "claude"
}

/**
 * Ensure reviews directory exists
 */
function ensureReviewsDir(): void {
  if (!fs.existsSync(REVIEWS_DIR)) {
    fs.mkdirSync(REVIEWS_DIR, { recursive: true })
  }
}

/**
 * Get filepath for a review by ID
 */
function getReviewPath(id: string): string {
  return join(REVIEWS_DIR, `${id}.json`)
}

/**
 * Save a review to storage
 * Called on process exit, Ctrl+C, or successful completion
 */
export function saveReview(review: StoredReview): void {
  ensureReviewsDir()
  
  const filepath = getReviewPath(review.id)
  fs.writeFileSync(filepath, JSON.stringify(review, null, 2))
  
  // Cleanup old reviews
  cleanupOldReviews()
}

/**
 * List reviews, sorted by updatedAt descending (most recent first)
 * Returns metadata only (no full content) for performance
 * @param cwd - If provided, only return reviews from this directory or its children
 */
export function listReviews(cwd?: string): ReviewMetadata[] {
  ensureReviewsDir()
  
  const files = fs.readdirSync(REVIEWS_DIR)
  const reviews: ReviewMetadata[] = []
  
  for (const filename of files) {
    if (!filename.endsWith(".json")) continue
    
    try {
      const filepath = join(REVIEWS_DIR, filename)
      const content = fs.readFileSync(filepath, "utf-8")
      const data = JSON.parse(content) as StoredReview
      
      // Filter by cwd if provided: include reviews from cwd or its children
      if (cwd && !data.cwd.startsWith(cwd)) {
        continue
      }
      
      reviews.push({
        id: data.id,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        status: data.status,
        cwd: data.cwd,
        title: data.title,
        agent: data.agent,
      })
    } catch {
      // Skip invalid files
    }
  }
  
  // Sort by updatedAt descending (most recently active first)
  reviews.sort((a, b) => b.updatedAt - a.updatedAt)
  
  return reviews
}

/**
 * Load a full review by ID
 */
export function loadReview(id: string): StoredReview | null {
  ensureReviewsDir()
  
  const filepath = getReviewPath(id)
  
  try {
    if (!fs.existsSync(filepath)) return null
    const content = fs.readFileSync(filepath, "utf-8")
    return JSON.parse(content) as StoredReview
  } catch {
    return null
  }
}

/**
 * Delete a review by ID
 */
export function deleteReview(id: string): boolean {
  ensureReviewsDir()
  
  const filepath = getReviewPath(id)
  
  try {
    if (!fs.existsSync(filepath)) return false
    fs.unlinkSync(filepath)
    return true
  } catch {
    return false
  }
}

/**
 * Cleanup old reviews, keeping only the most recent MAX_REVIEWS
 */
function cleanupOldReviews(): void {
  const files = fs.readdirSync(REVIEWS_DIR)
  
  // Load and sort by updatedAt
  const reviews: { filename: string; updatedAt: number }[] = []
  
  for (const filename of files) {
    if (!filename.endsWith(".json")) continue
    
    try {
      const filepath = join(REVIEWS_DIR, filename)
      const content = fs.readFileSync(filepath, "utf-8")
      const data = JSON.parse(content) as StoredReview
      reviews.push({ filename, updatedAt: data.updatedAt })
    } catch {
      // Skip invalid files
    }
  }
  
  // Sort by updatedAt descending (newest first)
  reviews.sort((a, b) => b.updatedAt - a.updatedAt)
  
  // Delete old ones beyond MAX_REVIEWS
  if (reviews.length > MAX_REVIEWS) {
    const toDelete = reviews.slice(MAX_REVIEWS)
    for (const { filename } of toDelete) {
      try {
        fs.unlinkSync(join(REVIEWS_DIR, filename))
      } catch {
        // Ignore deletion errors
      }
    }
  }
}

/**
 * Format relative time for display
 */
export function formatTimeAgo(timestamp: number | undefined): string {
  if (!timestamp || isNaN(timestamp)) return ""
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 0) return ""
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

/**
 * Truncate path for display, keeping last N segments
 */
export function truncatePath(path: string, maxSegments: number = 2): string {
  const segments = path.split("/").filter(Boolean)
  if (segments.length <= maxSegments) return path
  return ".../" + segments.slice(-maxSegments).join("/")
}
