// Shared types for the Agentation-based annotation system.
// Used by both server (CommentRoom Durable Object) and client (widget).
// Based on AFS (Agentation Feedback Spec) annotation format.

// AFS Annotation — the core data type
export interface Annotation {
  id: string
  comment: string
  elementPath: string
  timestamp: number
  x: number // % viewport width 0-100
  y: number // px from document top
  element: string // tag name
  url?: string
  boundingBox?: { x: number; y: number; width: number; height: number }
  reactComponents?: string
  cssClasses?: string
  computedStyles?: string
  accessibility?: string
  nearbyText?: string
  selectedText?: string
  fullPath?: string
  nearbyElements?: string
  isFixed?: boolean
  isMultiSelect?: boolean
  intent?: AnnotationIntent
  severity?: AnnotationSeverity
  status?: AnnotationStatus
  resolvedAt?: string
  resolvedBy?: "human" | "agent"
  thread?: ThreadMessage[]
  // Our extensions for multi-user
  createdBy?: string
  userName?: string
  anchor?: string // file:line for diff code context
  sessionId?: string
  createdAt?: string
  updatedAt?: string
}

export type AnnotationIntent = "fix" | "change" | "question" | "approve"
export type AnnotationSeverity = "blocking" | "important" | "suggestion"
export type AnnotationStatus = "pending" | "acknowledged" | "resolved" | "dismissed"

export interface ThreadMessage {
  id: string
  role: "human" | "agent"
  content: string
  timestamp: number
}

export interface ActionRequestedPayload {
  output: string
  annotationCount: number
}

export interface Session {
  id: string // = diff ID
  url?: string
  status: "active" | "approved" | "closed"
  createdAt: string
  updatedAt: string
  annotations: Annotation[]
}

// SSE event envelope (matches AFS spec)
export interface AgentationEvent {
  type:
    | "annotation.created"
    | "annotation.updated"
    | "annotation.deleted"
    | "action.requested"
    | "session.created"
    | "session.updated"
    | "session.closed"
    | "thread.message"
  timestamp: string
  sessionId: string
  sequence: number
  payload: Annotation | Session | ThreadMessage | ActionRequestedPayload
}

// Agent state synced via WebSocket (lightweight)
export interface RoomState {
  annotations: Annotation[]
}
