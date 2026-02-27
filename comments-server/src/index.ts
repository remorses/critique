// @critique.work/server — Annotation system server built on Cloudflare Agents.
// Deploy a CommentRoom Durable Object and Hono worker to get real-time
// annotations on any page, keyed by diff ID or arbitrary string.

export { CommentRoom } from "./comment-room.js"
export { createCommentsWorker } from "./worker.js"
export type { CommentWorkerEnv } from "./worker.js"
export type {
  Annotation,
  AnnotationIntent,
  AnnotationSeverity,
  AnnotationStatus,
  ThreadMessage,
  Session,
  AgentationEvent,
  RoomState,
} from "./types.js"
