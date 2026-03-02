// Hono sub-app mounting the Agentation HTTP API.
// Proxies all annotation/session/SSE requests to the CommentRoom Durable Object.
// Mounted at /a in the main worker, so Agentation client calls /a/sessions/:id/annotations etc.
//
// The agents SDK (built on partyserver) requires an x-partykit-room header
// on every request to a DO stub so it can initialize its name. Without this
// header, the DO throws "Missing namespace or room headers". We inject it
// via proxyToDO() on every proxied request.

import { Hono } from "hono"

type Bindings = {
  CommentRoom: {
    idFromName(name: string): { toString(): string }
    get(id: { toString(): string }): {
      fetch(request: Request): Promise<Response>
    }
  }
}

const api = new Hono<{ Bindings: Bindings; Variables: { userId: string } }>()

// Helper: proxy a request to the CommentRoom DO for a given session ID.
// Sets x-partykit-room so the agents SDK can initialize the DO name.
function proxyToDO(
  env: Bindings,
  sessionId: string,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const doId = env.CommentRoom.idFromName(sessionId)
  const stub = env.CommentRoom.get(doId)
  const headers = new Headers(init?.headers)
  headers.set("x-partykit-room", sessionId)
  return stub.fetch(new Request(url, { ...init, headers }))
}

// Helper: extract session ID from an annotation ID ({sessionId}_{uuid})
function parseAnnotationId(annotationId: string): { sessionId: string; rawId: string } | null {
  const idx = annotationId.indexOf("_")
  if (idx === -1) return null
  return {
    sessionId: annotationId.slice(0, idx),
    rawId: annotationId,
  }
}

// Health check (Agentation polls this)
api.get("/health", (c) => c.json({ status: "ok" }))



// Create session (Agentation calls POST /sessions with { url })
api.post("/sessions", async (c) => {
  const body = await c.req.json<{ url?: string }>()
  const url = body.url
  const match = url?.match(/\/v\/([a-f0-9]{16,32})/)
  const sessionId = match?.[1] || crypto.randomUUID()
  const resp = await proxyToDO(c.env, sessionId, "https://internal/api/session")
  const session = await resp.json()
  return c.json({ id: sessionId, ...session as object })
})

// List sessions — return empty for v1
api.get("/sessions", (c) => {
  return c.json({ sessions: [] })
})

// Get session with all annotations
api.get("/sessions/:id", async (c) => {
  const sessionId = c.req.param("id")
  const resp = await proxyToDO(c.env, sessionId, "https://internal/api/session")
  return new Response(resp.body, resp)
})

// Create annotation within a session
api.post("/sessions/:id/annotations", async (c) => {
  const sessionId = c.req.param("id")
  const body = await c.req.json<Record<string, unknown>>()

  // Prefix annotation ID with session ID for routing
  if (typeof body.id !== "string" || !body.id.startsWith(`${sessionId}_`)) {
    body.id = `${sessionId}_${crypto.randomUUID()}`
  }
  // Support legacy createdBy field from old clients
  const legacyCreatedBy = typeof body.createdBy === "string" ? body.createdBy : undefined
  body.authorId = body.authorId || legacyCreatedBy || c.get("userId")
  delete body.createdBy
  body.sessionId = sessionId

  const resp = await proxyToDO(c.env, sessionId, "https://internal/api/annotations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return new Response(resp.body, resp)
})

// Submit action request for a session
api.post("/sessions/:id/action", async (c) => {
  const sessionId = c.req.param("id")
  const body = await c.req.text()
  const resp = await proxyToDO(c.env, sessionId, "https://internal/api/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })
  return new Response(resp.body, resp)
})

// Get annotation by ID (annotation IDs encode session: {sessionId}_{uuid})
api.get("/annotations/:id", async (c) => {
  const parsed = parseAnnotationId(c.req.param("id"))
  if (!parsed) {
    return c.json({ error: "Invalid annotation ID format" }, 400)
  }
  const resp = await proxyToDO(c.env, parsed.sessionId, `https://internal/api/annotations/${parsed.rawId}`)
  return new Response(resp.body, resp)
})

// Update annotation
api.patch("/annotations/:id", async (c) => {
  const parsed = parseAnnotationId(c.req.param("id"))
  if (!parsed) {
    return c.json({ error: "Invalid annotation ID format" }, 400)
  }
  const body = await c.req.text()
  const resp = await proxyToDO(c.env, parsed.sessionId, `https://internal/api/annotations/${parsed.rawId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  })
  return new Response(resp.body, resp)
})

// Delete annotation
api.delete("/annotations/:id", async (c) => {
  const parsed = parseAnnotationId(c.req.param("id"))
  if (!parsed) {
    return c.json({ error: "Invalid annotation ID format" }, 400)
  }
  const resp = await proxyToDO(c.env, parsed.sessionId, `https://internal/api/annotations/${parsed.rawId}`, {
    method: "DELETE",
  })
  return new Response(resp.body, resp)
})

// Thread messages
api.post("/annotations/:id/thread", async (c) => {
  const parsed = parseAnnotationId(c.req.param("id"))
  if (!parsed) {
    return c.json({ error: "Invalid annotation ID format" }, 400)
  }
  const body = await c.req.text()
  const resp = await proxyToDO(c.env, parsed.sessionId, `https://internal/api/annotations/${parsed.rawId}/thread`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })
  return new Response(resp.body, resp)
})

// Pending annotations for a session
api.get("/sessions/:id/pending", async (c) => {
  const sessionId = c.req.param("id")
  const resp = await proxyToDO(c.env, sessionId, "https://internal/api/pending")
  return new Response(resp.body, resp)
})



// SSE events — proxy to DO's SSE endpoint
api.get("/sessions/:id/events", async (c) => {
  const sessionId = c.req.param("id")
  const resp = await proxyToDO(c.env, sessionId, "https://internal/api/events")
  const headers = new Headers(resp.headers)
  headers.set("Content-Type", "text/event-stream")
  headers.set("Cache-Control", "no-cache")
  headers.set("Connection", "keep-alive")
  headers.set("Access-Control-Allow-Origin", "*")
  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers,
  })
})

export { api as agentationApi }
