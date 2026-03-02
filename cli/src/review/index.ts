// AI-powered diff review module using Agent Client Protocol (ACP).
// Coordinates with OpenCode or Claude Code to generate progressive disclosure reviews.
// Re-exports all review functionality for use by the CLI.

export {
  parseHunksWithIds,
  hunksToContextXml,
  createHunkMap,
  buildPatch,
  createHunk,
  calculateLineOffsets,
  createSubHunk,
  initializeCoverage,
  markCovered,
  markHunkFullyCovered,
  updateCoverageFromGroup,
  getUncoveredPortions,
  formatUncoveredMessage,
  hunkToStableId,
  parseHunkId,
  findHunkByStableId,
  combineHunkPatches,
} from "./hunk-parser.js"
export { AcpClient, OpencodeAcpClient, createAcpClient, type AgentType } from "./acp-client.js"
export { compressSession, sessionsToContextXml } from "./session-context.js"
export { watchReviewYaml, readReviewYaml, waitForFirstValidGroup } from "./yaml-watcher.js"
export { StreamDisplay } from "./stream-display.js"
export { formatNotifications, formatNotification, type StreamLine } from "./acp-stream-display.js"
export type {
  IndexedHunk,
  ReviewYaml,
  ReviewGroup,
  ResolvedHunk,
  HunkCoverage,
  ReviewCoverage,
  UncoveredPortion,
  CompressedSession,
  SessionInfo,
  SessionContent,
} from "./types.js"
export {
  saveReview,
  listReviews,
  loadReview,
  deleteReview,
  formatTimeAgo,
  truncatePath,
} from "./storage.js"
export type { StoredReview, ReviewMetadata, ReviewStatus } from "./storage.js"
