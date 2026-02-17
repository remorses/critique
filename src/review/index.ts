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
} from "./hunk-parser.ts"
export { AcpClient, OpencodeAcpClient, createAcpClient, type AgentType } from "./acp-client.ts"
export { compressSession, sessionsToContextXml } from "./session-context.ts"
export { watchReviewYaml, readReviewYaml, waitForFirstValidGroup } from "./yaml-watcher.ts"
export { StreamDisplay } from "./stream-display.tsx"
export { formatNotifications, formatNotification, type StreamLine } from "./acp-stream-display.ts"
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
} from "./types.ts"
export {
  saveReview,
  listReviews,
  loadReview,
  deleteReview,
  formatTimeAgo,
  truncatePath,
} from "./storage.ts"
export type { StoredReview, ReviewMetadata, ReviewStatus } from "./storage.ts"
