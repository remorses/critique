// CommentRoom — Durable Object Agent for managing comment threads per room.
// Each room is identified by a key (typically a URL). Threads and comments
// are persisted in embedded SQLite; lightweight thread metadata is synced
// to all connected clients via the agents state system.

import { Agent, callable, type Connection, type ConnectionContext, type WSMessage } from "agents"
import type {
  RoomState,
  Thread,
  Comment,
  CreateThreadInput,
  AddCommentInput,
  UpdateThreadMetadataInput,
  CommentsApiResponse,
  PresenceMessage,
} from "./types.js"

/** Env must have a CommentRoom Durable Object binding. Users provide their own Env type. */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface CommentRoomEnv {
  [key: string]: unknown
}

export class CommentRoom extends Agent<CommentRoomEnv, RoomState> {
  initialState: RoomState = { threads: [] }

  async onStart() {
    this.sql`
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        threadId TEXT NOT NULL,
        body TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        createdBy TEXT NOT NULL,
        userName TEXT
      )
    `
    this.sql`
      CREATE INDEX IF NOT EXISTS idx_comments_thread
      ON comments (threadId, createdAt)
    `
  }

  // --- WebSocket presence ---

  onConnect(connection: Connection, ctx: ConnectionContext) {
    // Send current threads on connect (state is auto-synced by agents SDK)
    const url = new URL(ctx.request.url)
    const userId = url.searchParams.get("userId") || connection.id
    const userName = url.searchParams.get("userName") || undefined
    connection.setState({ userId, userName })
  }

  onMessage(connection: Connection, message: WSMessage) {
    if (typeof message !== "string") return
    try {
      const data = JSON.parse(message) as PresenceMessage
      if (data.type === "cursor" || data.type === "cursor-leave") {
        // Broadcast cursor presence to all other clients
        this.broadcast(message, [connection.id])
      }
    } catch {
      // Ignore malformed messages
    }
  }

  onClose(connection: Connection) {
    const state = connection.state as { userId?: string } | null
    if (state?.userId) {
      this.broadcast(
        JSON.stringify({ type: "cursor-leave", userId: state.userId }),
        [connection.id],
      )
    }
  }

  // --- Thread CRUD (callable from clients via RPC) ---

  @callable()
  createThread(input: CreateThreadInput): Thread {
    const threadId = crypto.randomUUID()
    const commentId = crypto.randomUUID()
    const now = new Date().toISOString()

    this.sql`
      INSERT INTO comments (id, threadId, body, createdAt, createdBy, userName)
      VALUES (${commentId}, ${threadId}, ${input.body}, ${now}, ${input.userId}, ${input.userName ?? null})
    `

    const thread: Thread = {
      id: threadId,
      createdAt: now,
      createdBy: input.userId,
      resolved: false,
      metadata: input.metadata,
      commentCount: 1,
      firstComment: {
        body: input.body,
        createdBy: input.userId,
        userName: input.userName,
      },
    }

    this.setState({
      threads: [...this.state.threads, thread],
    })

    return thread
  }

  @callable()
  addComment(input: AddCommentInput): Comment {
    const commentId = crypto.randomUUID()
    const now = new Date().toISOString()

    // Verify thread exists
    const thread = this.state.threads.find((t) => t.id === input.threadId)
    if (!thread) {
      throw new Error(`Thread ${input.threadId} not found`)
    }

    this.sql`
      INSERT INTO comments (id, threadId, body, createdAt, createdBy, userName)
      VALUES (${commentId}, ${input.threadId}, ${input.body}, ${now}, ${input.userId}, ${input.userName ?? null})
    `

    const comment: Comment = {
      id: commentId,
      threadId: input.threadId,
      body: input.body,
      createdAt: now,
      createdBy: input.userId,
      userName: input.userName,
    }

    // Update thread in synced state
    this.setState({
      threads: this.state.threads.map((t) =>
        t.id === input.threadId
          ? {
              ...t,
              commentCount: t.commentCount + 1,
            }
          : t,
      ),
    })

    return comment
  }

  @callable()
  resolveThread(threadId: string): void {
    const thread = this.state.threads.find((t) => t.id === threadId)
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`)
    }

    this.setState({
      threads: this.state.threads.map((t) =>
        t.id === threadId ? { ...t, resolved: !t.resolved } : t,
      ),
    })
  }

  @callable()
  deleteThread(threadId: string): void {
    const thread = this.state.threads.find((t) => t.id === threadId)
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`)
    }

    // Delete comments from SQL
    this.sql`DELETE FROM comments WHERE threadId = ${threadId}`

    // Remove thread from synced state
    this.setState({
      threads: this.state.threads.filter((t) => t.id !== threadId),
    })
  }

  @callable()
  updateThreadMetadata(input: UpdateThreadMetadataInput): void {
    const thread = this.state.threads.find((t) => t.id === input.threadId)
    if (!thread) {
      throw new Error(`Thread ${input.threadId} not found`)
    }

    this.setState({
      threads: this.state.threads.map((t) =>
        t.id === input.threadId
          ? { ...t, metadata: { ...t.metadata, ...input.metadata } }
          : t,
      ),
    })
  }

  // --- Query methods ---

  @callable()
  getThreadComments(threadId: string): Comment[] {
    return this.sql<Comment>`
      SELECT id, threadId, body, createdAt, createdBy, userName
      FROM comments
      WHERE threadId = ${threadId}
      ORDER BY createdAt ASC
    `
  }

  getAllComments(): CommentsApiResponse {
    const threads = this.state.threads
    const comments: Record<string, Comment[]> = {}

    for (const thread of threads) {
      comments[thread.id] = this.sql<Comment>`
        SELECT id, threadId, body, createdAt, createdBy, userName
        FROM comments
        WHERE threadId = ${thread.id}
        ORDER BY createdAt ASC
      `
    }

    return { threads, comments }
  }

  // --- HTTP handler for API access ---

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/api/comments" && request.method === "GET") {
      const data = this.getAllComments()
      return Response.json(data)
    }

    // Let the base class handle WebSocket upgrades and RPC
    return super.onRequest(request)
  }
}
