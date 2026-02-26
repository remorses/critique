// Shared types for the comment system.
// Used by both server (CommentRoom Agent) and client (React components).

export interface ThreadMetadata {
  /** Comma-separated CSS selector fallbacks for pinning position */
  cursorSelectors: string
  /** 0-1 fraction across the target element width */
  cursorX: number
  /** 0-1 fraction down the target element height */
  cursorY: number
  /** Stacking order among pins */
  zIndex: number
  /** Optional application-specific anchor (e.g. "file:line" for diff comments) */
  anchor?: string
}

export interface CommentPreview {
  body: string
  createdBy: string
  userName?: string
}

export interface Thread {
  id: string
  createdAt: string
  createdBy: string
  resolved: boolean
  metadata: ThreadMetadata
  commentCount: number
  /** The first comment in the thread (used for preview display) */
  firstComment?: CommentPreview
}

export interface Comment {
  id: string
  threadId: string
  body: string
  createdAt: string
  createdBy: string
  userName?: string
}

/** Lightweight state synced to all connected clients via WebSocket */
export interface RoomState {
  threads: Thread[]
}

/** Input for creating a new thread */
export interface CreateThreadInput {
  metadata: ThreadMetadata
  body: string
  userId: string
  userName?: string
}

/** Input for adding a comment to an existing thread */
export interface AddCommentInput {
  threadId: string
  body: string
  userId: string
  userName?: string
}

/** Input for updating thread metadata (e.g. repositioning a pin) */
export interface UpdateThreadMetadataInput {
  threadId: string
  metadata: Partial<ThreadMetadata>
}

/** Response for the comments API (agent-consumable) */
export interface CommentsApiResponse {
  threads: Thread[]
  comments: Record<string, Comment[]>
}

/** WebSocket message types for presence */
export type PresenceMessage =
  | { type: "cursor"; x: number; y: number; selectors: string; userId: string }
  | { type: "cursor-leave"; userId: string }
