// CommentRoom — Durable Object Agent for managing annotations per room.
// Each room is identified by a key (typically a diff ID). Annotations are
// persisted as JSON blobs in SQLite with minimal indexed columns (id, timestamp, status).
// Thread messages are stored inside the annotation JSON directly.
//
// Exposes an HTTP API (onRequest) compatible with the Agentation spec,
// plus SSE streaming for real-time updates.

import { Agent } from "agents"
import type {
  RoomState,
  Annotation,
  ThreadMessage,
  AgentationEvent,
  ActionRequestedPayload,
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
    this.handleActionPost = this.handleActionPost.bind(this)
    this.handleSession = this.handleSession.bind(this)
    this.handleEvents = this.handleEvents.bind(this)
  }

  async onStart() {
    this.sql`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`

    const versionRow = this.sql<{ value: string }>`
      SELECT value FROM meta WHERE key = 'schema_version'
    `
    const schemaVersion = versionRow[0]?.value ?? "0"

    if (schemaVersion !== "2") {
      // One-time migration: drop old wide-column schema + separate thread_messages table.
      // All data was duplicated in fullJson anyway; threads are now stored inside annotation JSON.
      this.sql`DROP TABLE IF EXISTS thread_messages`
      this.sql`DROP TABLE IF EXISTS annotations`

      this.sql`
        CREATE TABLE IF NOT EXISTS annotations (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          status TEXT DEFAULT 'pending',
          data TEXT NOT NULL
        )
      `

      this.sql`CREATE INDEX IF NOT EXISTS idx_annotations_status ON annotations(status)`
      this.sql`INSERT INTO meta (key, value) VALUES ('schema_version', '2') ON CONFLICT(key) DO UPDATE SET value = '2'`
    }

    // Load annotations into state on startup
    const annotations = this.loadAllAnnotations()
    this.setState({ annotations })
  }

  // --- SQL helpers ---

  private loadAllAnnotations(): Annotation[] {
    const rows = this.sql<{ data: string }>`
      SELECT data FROM annotations ORDER BY timestamp ASC
    `
    return rows.map((row) => JSON.parse(row.data) as Annotation)
  }

  private loadAnnotation(id: string): Annotation | null {
    const rows = this.sql<{ data: string }>`
      SELECT data FROM annotations WHERE id = ${id}
    `
    if (rows.length === 0) return null
    return JSON.parse(rows[0].data) as Annotation
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
      authorId: input.authorId,
      userName: input.userName,
      anchor: input.anchor,
      sessionId: input.sessionId,
      createdAt: now,
      updatedAt: now,
    }

    this.sql`
      INSERT INTO annotations (id, timestamp, status, data)
      VALUES (${annotation.id}, ${annotation.timestamp}, ${annotation.status ?? null}, ${JSON.stringify(annotation)})
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

    this.sql`
      UPDATE annotations
      SET status = ${updated.status ?? null},
          data = ${JSON.stringify(updated)}
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

    const now = new Date().toISOString()
    const updated: Annotation = {
      ...existing,
      thread: [...(existing.thread || []), msg],
      updatedAt: now,
    }

    this.sql`
      UPDATE annotations
      SET data = ${JSON.stringify(updated)}
      WHERE id = ${annotationId}
    `

    this.setState({
      annotations: this.state.annotations.map((a) =>
        a.id === annotationId ? updated : a,
      ),
    })

    this.emitSSE("thread.message", msg)
    return msg
  }

  // --- SSE ---

  private emitSSE(
    type: AgentationEvent["type"],
    payload: AgentationEvent["payload"],
  ): number {
    this.sequence++
    const event: AgentationEvent = {
      type,
      timestamp: new Date().toISOString(),
      sessionId: this.name,
      sequence: this.sequence,
      payload,
    }
    const data = `event: ${type}\ndata: ${JSON.stringify(event)}\nid: ${this.sequence}\n\n`
    const encoded = new TextEncoder().encode(data)
    const activeWriters = Array.from(this.sseClients)
    for (const writer of activeWriters) {
      writer.write(encoded).catch(() => {
        this.sseClients.delete(writer)
        writer.close().catch(() => undefined)
      })
    }
    return activeWriters.length
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

    // POST /api/action
    if (path === "/api/action" && method === "POST") {
      return this.handleActionPost(request)
    }

    // GET /api/session
    if (path === "/api/session" && method === "GET") {
      return this.handleSession()
    }

    // GET /api/events — SSE
    if (path === "/api/events" && method === "GET") {
      return this.handleEvents(request)
    }

    return new Response("Not found", { status: 404 })
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

  private async handleActionPost(request: Request): Promise<Response> {
    let output = ""
    try {
      const body = await request.json() as { output?: unknown }
      if (typeof body.output === "string") {
        output = body.output
      }
    } catch {
      // Empty or malformed JSON body is treated as empty output.
    }

    const annotationCount = this.state.annotations.length
    const payload: ActionRequestedPayload = {
      output,
      annotationCount,
    }
    const sseListeners = this.emitSSE("action.requested", payload)

    return Response.json({
      success: true,
      annotationCount,
      delivered: {
        sseListeners,
        webhooks: 0,
        total: sseListeners,
      },
    })
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

  private handleEvents(request: Request): Response {
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    this.sseClients.add(writer)

    let cleanedUp = false
    const cleanup = () => {
      if (cleanedUp) return
      cleanedUp = true
      this.sseClients.delete(writer)
      writer.close().catch(() => undefined)
    }
    request.signal.addEventListener("abort", cleanup, { once: true })

    // Send initial connection event
    const connectEvent = `event: connected\ndata: ${JSON.stringify({ sessionId: this.name })}\n\n`
    writer.write(new TextEncoder().encode(connectEvent)).catch(() => {
      cleanup()
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
