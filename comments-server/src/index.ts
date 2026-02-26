// @critique.work/server — Comment system server built on Cloudflare Agents.
// Deploy a CommentRoom Durable Object and Hono worker to get real-time
// threaded comments on any page, keyed by URL or arbitrary string.

export { CommentRoom } from "./comment-room.js"
export { createCommentsWorker } from "./worker.js"
export type { CommentWorkerEnv } from "./worker.js"
export type {
  Thread,
  Comment,
  ThreadMetadata,
  RoomState,
  CreateThreadInput,
  AddCommentInput,
  UpdateThreadMetadataInput,
  CommentsApiResponse,
  CommentPreview,
  PresenceMessage,
} from "./types.js"
