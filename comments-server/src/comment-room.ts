// CommentRoom — Durable Object Agent for managing annotations per room.
// Each room is identified by a key (typically a diff ID). Annotations and
// thread messages are persisted in embedded SQLite; lightweight annotation
// summaries are synced to all connected clients via the agents state system.
//
// Exposes an HTTP API (onRequest) compatible with the Agentation spec,
// plus SSE streaming for real-time multi-user sync.

import { Agent, type Connection, type ConnectionContext, type WSMessage } from "agents"
import type {
  RoomState,
  Annotation,
  ThreadMessage,
  AgentationEvent,
} from "./types.js"

interface CommentRoomEnv {
  [key: string]: unknown
}

export class CommentRoom extends Agent<CommentRoomEnv, RoomState> {
  initialState: RoomState = { annotations: [] }

  private sseClients = new Set<WritableStreamDefaultWriter>()
  private sequence = 0

  constructor(state: DurableObjectState, env: CommentRoomEnv) {
    super(state, env)
    this.emitSSE = this.emitSSE.bind(this)
    this.handleAnnotationsGet = this.handleAnnotationsGet.bind(this)
    this.handleAnnotationsPost = this.handleAnnotationsPost.bind(this)
    this.handleAnnotationGet = this.handleAnnotationGet.bind(this)
    this.handleAnnotationPatch = this.handleAnnotationPatch.bind(this)
    this.handleAnnotationDelete = this.handleAnnotationDelete.bind(this)
    this.handleThreadPost = this.handleThreadPost.bind(this)
    this.handlePending = this.handlePending.bind(this)
    this.handleSession = this.handleSession.bind(this)
    this.handleEvents = this.handleEvents.bind(this)
  }

  async onStart() {
    this.sql`
      CREATE TABLE IF NOT EXISTS annotations (
        id TEXT PRIMARY KEY,
        comment TEXT NOT NULL,
        elementPath TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        x REAL NOT NULL,
        y REAL NOT NULL,
        element TEXT NOT NULL,
        url TEXT,
        status TEXT DEFAULT 'pending',
        intent TEXT,
        severity TEXT,
        resolvedAt TEXT,
        resolvedBy TEXT,
        createdBy TEXT,
        userName TEXT,
        anchor TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        fullJson TEXT NOT NULL
      )
    `

    this.sql`
      CREATE TABLE IF NOT EXISTS thread_messages (
        id TEXT PRIMARY KEY,
        annotationId TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (annotationId) REFERENCES annotations(id) ON DELETE CASCADE
      )
    `

    this.sql`
      CREATE INDEX IF NOT EXISTS idx_thread_annotation
        ON thread_messages(annotationId, timestamp)
    `

    this.sql`
      CREATE INDEX IF NOT EXISTS idx_annotations_status
        ON annotations(status)
    `

    // Load annotations into state on startup
    const annotations = this.loadAllAnnotations()
    this.setState({ annotations })
  }

  // --- WebSocket presence ---

  onConnect(connection: Connection, ctx: ConnectionContext) {
    const url = new URL(ctx.request.url)
    const userId = url.searchParams.get("userId") || connection.id
    const userName = url.searchParams.get("userName") || undefined
    connection.setState({ userId, userName })
  }

  onMessage(connection: Connection, message: WSMessage) {
    if (typeof message !== "string") return
    try {
      const data = JSON.parse(message)
      if (data.type === "cursor" || data.type === "cursor-leave") {
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

  // --- SQL helpers ---

  private loadAllAnnotations(): Annotation[] {
    const rows = this.sql<{ id: string; fullJson: string }>`
      SELECT id, fullJson FROM annotations ORDER BY timestamp ASC
    `
    return rows.map((row) => {
      const annotation = JSON.parse(row.fullJson) as Annotation
      annotation.thread = this.loadThreadMessages(row.id)
      return annotation
    })
  }

  private loadAnnotation(id: string): Annotation | null {
    const rows = this.sql<{ fullJson: string }>`
      SELECT fullJson FROM annotations WHERE id = ${id}
    `
    if (rows.length === 0) return null
    const annotation = JSON.parse(rows[0].fullJson) as Annotation
    annotation.thread = this.loadThreadMessages(id)
    return annotation
  }

  private loadThreadMessages(annotationId: string): ThreadMessage[] {
    return this.sql<ThreadMessage>`
      SELECT id, role, content, timestamp
      FROM thread_messages
      WHERE annotationId = ${annotationId}
      ORDER BY timestamp ASC
    `
  }

  // --- Annotation CRUD ---

  createAnnotation(input: Partial<Annotation> & { comment: string }): Annotation {
    const now = new Date().toISOString()
    const annotation: Annotation = {
      id: input.id || crypto.randomUUID(),
      comment: input.comment,
      elementPath: input.elementPath || "",
      timestamp: input.timestamp || Date.now(),
      x: input.x ?? 0,
      y: input.y ?? 0,
      element: input.element || "div",
      url: input.url,
      boundingBox: input.boundingBox,
      reactComponents: input.reactComponents,
      cssClasses: input.cssClasses,
      computedStyles: input.computedStyles,
      accessibility: input.accessibility,
      nearbyText: input.nearbyText,
      selectedText: input.selectedText,
      fullPath: input.fullPath,
      nearbyElements: input.nearbyElements,
      isFixed: input.isFixed,
      isMultiSelect: input.isMultiSelect,
      intent: input.intent,
      severity: input.severity,
      status: input.status || "pending",
      resolvedAt: input.resolvedAt,
      resolvedBy: input.resolvedBy,
      createdBy: input.createdBy,
      userName: input.userName,
      anchor: input.anchor,
      sessionId: input.sessionId,
      createdAt: now,
      updatedAt: now,
    }

    const fullJson = JSON.stringify(annotation)
    this.sql`
      INSERT INTO annotations (id, comment, elementPath, timestamp, x, y, element, url, status, intent, severity, resolvedAt, resolvedBy, createdBy, userName, anchor, createdAt, updatedAt, fullJson)
      VALUES (
        ${annotation.id},
        ${annotation.comment},
        ${annotation.elementPath},
        ${annotation.timestamp},
        ${annotation.x},
        ${annotation.y},
        ${annotation.element},
        ${annotation.url ?? null},
        ${annotation.status ?? null},
        ${annotation.intent ?? null},
        ${annotation.severity ?? null},
        ${annotation.resolvedAt ?? null},
        ${annotation.resolvedBy ?? null},
        ${annotation.createdBy ?? null},
        ${annotation.userName ?? null},
        ${annotation.anchor ?? null},
        ${now},
        ${now},
        ${fullJson}
      )
    `

    this.setState({
      annotations: [...this.state.annotations, annotation],
    })

    this.emitSSE("annotation.created", annotation)
    return annotation
  }

  updateAnnotation(id: string, partial: Partial<Annotation>): Annotation {
    const existing = this.loadAnnotation(id)
    if (!existing) {
      throw new Error(`Annotation ${id} not found`)
    }

    const now = new Date().toISOString()
    const updated: Annotation = { ...existing, ...partial, id, updatedAt: now }
    // Preserve thread from existing
    updated.thread = existing.thread

    this.sql`
      UPDATE annotations
      SET comment = ${updated.comment},
          elementPath = ${updated.elementPath},
          x = ${updated.x},
          y = ${updated.y},
          element = ${updated.element},
          status = ${updated.status ?? null},
          intent = ${updated.intent ?? null},
          severity = ${updated.severity ?? null},
          resolvedAt = ${updated.resolvedAt ?? null},
          resolvedBy = ${updated.resolvedBy ?? null},
          updatedAt = ${now},
          fullJson = ${JSON.stringify(updated)}
      WHERE id = ${id}
    `

    this.setState({
      annotations: this.state.annotations.map((a) =>
        a.id === id ? updated : a,
      ),
    })

    this.emitSSE("annotation.updated", updated)
    return updated
  }

  deleteAnnotation(id: string): void {
    const existing = this.loadAnnotation(id)
    if (!existing) {
      throw new Error(`Annotation ${id} not found`)
    }

    this.sql`DELETE FROM thread_messages WHERE annotationId = ${id}`
    this.sql`DELETE FROM annotations WHERE id = ${id}`

    this.setState({
      annotations: this.state.annotations.filter((a) => a.id !== id),
    })

    this.emitSSE("annotation.deleted", { id } as Annotation)
  }

  addThreadMessage(annotationId: string, input: { role: "human" | "agent"; content: string }): ThreadMessage {
    const existing = this.loadAnnotation(annotationId)
    if (!existing) {
      throw new Error(`Annotation ${annotationId} not found`)
    }

    const msg: ThreadMessage = {
      id: crypto.randomUUID(),
      role: input.role,
      content: input.content,
      timestamp: Date.now(),
    }

    this.sql`
      INSERT INTO thread_messages (id, annotationId, role, content, timestamp)
      VALUES (${msg.id}, ${annotationId}, ${msg.role}, ${msg.content}, ${msg.timestamp})
    `

    // Update annotation in state with new thread message
    this.setState({
      annotations: this.state.annotations.map((a) =>
        a.id === annotationId
          ? { ...a, thread: [...(a.thread || []), msg], updatedAt: new Date().toISOString() }
          : a,
      ),
    })

    this.emitSSE("thread.message", msg)
    return msg
  }

  // --- SSE ---

  private emitSSE(type: string, payload: unknown) {
    this.sequence++
    const event: AgentationEvent = {
      type: type as AgentationEvent["type"],
      timestamp: new Date().toISOString(),
      sessionId: this.name,
      sequence: this.sequence,
      payload: payload as Annotation,
    }
    const data = `event: ${type}\ndata: ${JSON.stringify(event)}\nid: ${this.sequence}\n\n`
    const encoded = new TextEncoder().encode(data)
    for (const writer of this.sseClients) {
      writer.write(encoded).catch(() => {
        this.sseClients.delete(writer)
      })
    }
  }

  // --- HTTP API (onRequest) ---

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method

    // GET /api/annotations — list all
    if (path === "/api/annotations" && method === "GET") {
      return this.handleAnnotationsGet()
    }

    // POST /api/annotations — create
    if (path === "/api/annotations" && method === "POST") {
      return this.handleAnnotationsPost(request)
    }

    // GET /api/annotations/:id
    const annotationMatch = path.match(/^\/api\/annotations\/([^/]+)$/)
    if (annotationMatch && method === "GET") {
      return this.handleAnnotationGet(annotationMatch[1])
    }

    // PATCH /api/annotations/:id
    if (annotationMatch && method === "PATCH") {
      return this.handleAnnotationPatch(annotationMatch[1], request)
    }

    // DELETE /api/annotations/:id
    if (annotationMatch && method === "DELETE") {
      return this.handleAnnotationDelete(annotationMatch[1])
    }

    // POST /api/annotations/:id/thread
    const threadMatch = path.match(/^\/api\/annotations\/([^/]+)\/thread$/)
    if (threadMatch && method === "POST") {
      return this.handleThreadPost(threadMatch[1], request)
    }

    // GET /api/pending
    if (path === "/api/pending" && method === "GET") {
      return this.handlePending()
    }

    // GET /api/session
    if (path === "/api/session" && method === "GET") {
      return this.handleSession()
    }

    // GET /api/events — SSE
    if (path === "/api/events" && method === "GET") {
      return this.handleEvents()
    }

    // Legacy: GET /api/comments — backwards compat for old API consumers
    if (path === "/api/comments" && method === "GET") {
      return this.handleAnnotationsGet()
    }

    // Let the base class handle WebSocket upgrades and RPC
    return super.onRequest(request)
  }

  private handleAnnotationsGet(): Response {
    const annotations = this.loadAllAnnotations()
    return Response.json(annotations)
  }

  private async handleAnnotationsPost(request: Request): Promise<Response> {
    const body = await request.json() as Partial<Annotation> & { comment: string }
    const annotation = this.createAnnotation(body)
    return Response.json(annotation, { status: 201 })
  }

  private handleAnnotationGet(id: string): Response {
    const annotation = this.loadAnnotation(id)
    if (!annotation) {
      return Response.json({ error: "Not found" }, { status: 404 })
    }
    return Response.json(annotation)
  }

  private async handleAnnotationPatch(id: string, request: Request): Promise<Response> {
    try {
      const body = await request.json() as Partial<Annotation>
      const updated = this.updateAnnotation(id, body)
      return Response.json(updated)
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 404 })
    }
  }

  private handleAnnotationDelete(id: string): Response {
    try {
      this.deleteAnnotation(id)
      return Response.json({ success: true })
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 404 })
    }
  }

  private async handleThreadPost(annotationId: string, request: Request): Promise<Response> {
    try {
      const body = await request.json() as { role: "human" | "agent"; content: string }
      const msg = this.addThreadMessage(annotationId, body)
      return Response.json(msg, { status: 201 })
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 404 })
    }
  }

  private handlePending(): Response {
    const pending = this.state.annotations.filter((a) => a.status === "pending")
    return Response.json({ count: pending.length, annotations: pending })
  }

  private handleSession(): Response {
    const now = new Date().toISOString()
    return Response.json({
      id: this.name,
      status: "active",
      createdAt: now,
      updatedAt: now,
      annotations: this.state.annotations,
    })
  }

  private handleEvents(): Response {
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    this.sseClients.add(writer)

    // Send initial connection event
    const connectEvent = `event: connected\ndata: ${JSON.stringify({ sessionId: this.name })}\n\n`
    writer.write(new TextEncoder().encode(connectEvent)).catch(() => {
      this.sseClients.delete(writer)
    })

    // Clean up when client disconnects
    readable.pipeTo(new WritableStream()).catch(() => {
      this.sseClients.delete(writer)
    })

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    })
  }
}
