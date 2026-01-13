// Review module - AI-powered diff review using ACP
// Exports for use in CLI

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
} from "./hunk-parser.ts"
export { OpencodeAcpClient, createAcpClient } from "./acp-client.ts"
export { compressSession, sessionsToContextXml } from "./session-context.ts"
export { watchReviewYaml, readReviewYaml } from "./yaml-watcher.ts"
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
