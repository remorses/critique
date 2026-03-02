# Migration Plan: critique comments → Agentation (Path 2 — SSE Real-Time)

## Architecture Overview

```
┌───────────────────────────────────────────────────────────┐
│  Browser A                     Browser B                  │
│                                                           │
│  <Agentation                   <Agentation                │
│    endpoint="/a"                 endpoint="/a"             │
│    sessionId={diffId}            sessionId={diffId}        │
│  />                            />                         │
│    │                             ▲                        │
│    │ POST /a/sessions/:id/       │ EventSource            │
│    │   annotations               │ /a/sessions/:id/events │
│    └──────────┬──────────────────┘                        │
└───────────────┼───────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────┐
│  Cloudflare Worker (critique.work)          cli/src/      │
│                                                           │
│  Existing routes (unchanged):                             │
│    POST /upload          GET /v/:id (modified)            │
│    GET /buy              POST /stripe/webhook             │
│    GET /og/:id.png       DELETE /v/:id                    │
│    GET /raw/:id          GET /agents/*                    │
│                                                           │
│  New routes (Agentation HTTP API):                        │
│    /a/health                    → 200 OK                  │
│    /a/sessions                  → list/create sessions    │
│    /a/sessions/:id              → get session + annots    │
│    /a/sessions/:id/annotations  → create annotation       │
│    /a/sessions/:id/pending      → get pending             │
│    /a/sessions/:id/events       → SSE stream              │
│    /a/annotations/:id           → get/update/delete       │
│    /a/annotations/:id/thread    → add thread message      │
│                                                           │
│  Modified route:                                          │
│    GET /v/:id  → inject agentation-widget.js instead of   │
│                  comments.js                              │
└─────────────────────────┬─────────────────────────────────┘
                          │
                          ▼
┌───────────────────────────────────────────────────────────┐
│  CommentRoom Durable Object    comments-server/src/       │
│                                                           │
│  SQLite tables (new schema):                              │
│    annotations  — full AFS annotation data                │
│    thread_messages — threaded replies per annotation       │
│                                                           │
│  Agent state (broadcast to WS clients):                   │
│    { annotations: AnnotationSummary[] }                   │
│                                                           │
│  HTTP handler (onRequest):                                │
│    Agentation-compatible REST API                         │
│    SSE streaming via long-lived Response                  │
│                                                           │
│  @callable RPC (kept for future WS real-time):            │
│    createAnnotation, updateAnnotation, etc.               │
└───────────────────────────────────────────────────────────┘
```

## Agentation Modification (not PRing now)

The one change needed in the `agentation` npm package — add `annotation.created` and `annotation.deleted` SSE event handlers alongside the existing `annotation.updated` handler.

Current code in agentation source (index.mjs:2958-2986):

```js
// EXISTING — only handles resolved/dismissed removal
eventSource.addEventListener("annotation.updated", handler);
```

**Needed additions** (will fork or monkey-patch):

```js
// Add incoming annotations from other users
eventSource.addEventListener("annotation.created", (e) => {
  const event = JSON.parse(e.data);
  const ann = event.payload;
  setAnnotations(prev => {
    if (prev.some(a => a.id === ann.id)) return prev;
    return [...prev, ann];
  });
});

// Remove annotations deleted by other users
eventSource.addEventListener("annotation.deleted", (e) => {
  const event = JSON.parse(e.data);
  const id = event.payload.id;
  setExitingMarkers(prev => new Set(prev).add(id));
  setTimeout(() => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    setExitingMarkers(prev => { const s = new Set(prev); s.delete(id); return s; });
  }, 150);
});
```

**Strategy for now:** Fork `agentation` to `@critique.work/agentation` with this single change. Bundle from the fork. File upstream PR later.

---

## What Gets Deleted / Stays / New

### Deleted

| File | Why |
|---|---|
| `comments-client/src/components/provider.tsx` | Replaced by Agentation's internal sync + endpoint |
| `comments-client/src/components/overlay.tsx` | Replaced by Agentation's marker/annotation UI |
| `comments-client/src/components/toolbar.tsx` | Replaced by Agentation's toolbar |
| `comments-client/src/components/sidebar.tsx` | Agentation doesn't have a sidebar — annotations are inline |
| `comments-client/src/components/thread-view.tsx` | Replaced by Agentation's thread UI |
| `comments-client/src/components/new-thread.tsx` | Replaced by Agentation's click-to-annotate flow |
| `comments-client/src/components/composer.tsx` | Replaced by Agentation's annotation popup |
| `comments-client/src/components/comments.tsx` | Just composed Overlay + Toolbar — gone |
| `comments-client/src/lib/coords.ts` | CSS-selector coordinate system replaced by Agentation elementPath + x/y |
| `comments-client/src/hooks/use-max-z-index.ts` | Agentation manages stacking internally |
| `comments-client/src/hooks/use-near-edge.ts` | Agentation handles popup flipping internally |
| `comments-client/src/index.ts` | Package barrel — deleted with package |
| `comments-client/src/styles.css` | All custom CSS replaced by Agentation's built-in styles |
| `cli/public/comments.js` | Build artifact — replaced by agentation-widget.js |
| `cli/public/comments.css` | Build artifact — Agentation bundles its own CSS |

### Modified

| File | Changes |
|---|---|
| `comments-server/src/types.ts` | Replace Thread/Comment/ThreadMetadata types with AFS-compatible Annotation/ThreadMessage/Session types |
| `comments-server/src/comment-room.ts` | New SQL schema (annotations + thread_messages tables), new @callable() methods, new onRequest handler with Agentation HTTP API + SSE |
| `comments-server/src/worker.ts` | Keep createCommentsWorker() but update routes to match Agentation API shape |
| `comments-server/src/index.ts` | Update re-exports |
| `comments-client/src/widget.tsx` | Complete rewrite — render `<Agentation />` instead of our custom components |
| `comments-client/package.json` | Replace deps: remove agents, @critique.work/server, react-dom; add agentation (or forked) |
| `cli/src/worker.tsx` | Add /a/* route group for Agentation API, update handleView widget injection |
| `cli/wrangler.jsonc` | Add DO migration tag v2 for schema change |
| Root `package.json` | Update build:comments-widget script |

### New

| File | Purpose |
|---|---|
| `cli/src/agentation-api.ts` | Hono sub-app mounting Agentation HTTP API, proxying to CommentRoom DO |
| `cli/src/routes/annotations-context.tsx` | New route GET /v/:id/annotations — annotations with surrounding code context |

---

## File-by-File Implementation Details

### Step 1: `comments-server/src/types.ts` — Replace types

Replace all existing types with AFS-compatible ones:

```ts
// AFS Annotation — the core data type
export interface Annotation {
  id: string
  comment: string
  elementPath: string
  timestamp: number
  x: number              // % viewport width 0-100
  y: number              // px from document top
  element: string        // tag name
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
  anchor?: string        // file:line for diff code context
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

export interface Session {
  id: string              // = diff ID
  url?: string
  status: "active" | "approved" | "closed"
  createdAt: string
  updatedAt: string
  annotations: Annotation[]
}

// SSE event envelope (matches AFS spec)
export interface AgentationEvent {
  type: "annotation.created" | "annotation.updated" | "annotation.deleted"
      | "session.created" | "session.updated" | "session.closed"
      | "thread.message"
  timestamp: string
  sessionId: string
  sequence: number
  payload: Annotation | Session | ThreadMessage
}

// Agent state synced via WebSocket (lightweight)
export interface RoomState {
  annotations: Annotation[]
}
```

---

### Step 2: `comments-server/src/comment-room.ts` — Rewrite DO

**New SQL schema** in onStart():

```sql
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
);

CREATE TABLE IF NOT EXISTS thread_messages (
  id TEXT PRIMARY KEY,
  annotationId TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (annotationId) REFERENCES annotations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_thread_annotation
  ON thread_messages(annotationId, timestamp);

CREATE INDEX IF NOT EXISTS idx_annotations_status
  ON annotations(status);
```

**Design note:** Store the full annotation JSON in `fullJson` column to preserve all optional AFS fields (boundingBox, cssClasses, computedStyles, etc.) without needing a column for each. Index only the fields we query on (id, status, createdBy).

**New @callable() methods:**

| Method | What it does |
|---|---|
| `createAnnotation(annotation)` | Insert into SQL, append to state, return annotation |
| `updateAnnotation(id, partial)` | Update SQL + state, return updated annotation |
| `deleteAnnotation(id)` | Delete from SQL + thread_messages, remove from state |
| `addThreadMessage(annotationId, msg)` | Insert into thread_messages, update state |
| `getAnnotation(id)` | SQL SELECT + thread messages |
| `getPending()` | SELECT WHERE status = 'pending' |
| `getAllAnnotations()` | SELECT all + thread messages |

**State management:** `this.state = { annotations: Annotation[] }` — same pattern as before but with AFS annotations instead of threads. Each `setState()` call broadcasts to all WebSocket clients.

**onRequest handler — Agentation HTTP API:**

The DO's onRequest now handles both the Agentation REST API and SSE:

```
GET  /api/annotations         → getAllAnnotations()
POST /api/annotations         → createAnnotation(body) + emit SSE
GET  /api/annotations/:id     → getAnnotation(id)
PATCH /api/annotations/:id    → updateAnnotation(id, body) + emit SSE
DELETE /api/annotations/:id   → deleteAnnotation(id) + emit SSE
POST /api/annotations/:id/thread → addThreadMessage(id, body) + emit SSE
GET  /api/pending             → getPending()
GET  /api/session             → return session metadata + all annotations
GET  /api/events              → SSE long-lived response
```

**SSE implementation in DO:**

The DO maintains a `Set<WritableStreamDefaultWriter>` for active SSE connections. Each mutation (create/update/delete) writes an event to all writers:

```ts
private sseClients = new Set<WritableStreamDefaultWriter>()
private sequence = 0

private emitSSE(type: string, payload: any) {
  this.sequence++
  const event: AgentationEvent = {
    type, timestamp: new Date().toISOString(),
    sessionId: this.name, sequence: this.sequence, payload
  }
  const data = `event: ${type}\ndata: ${JSON.stringify(event)}\nid: ${this.sequence}\n\n`
  for (const writer of this.sseClients) {
    writer.write(new TextEncoder().encode(data)).catch(() => {
      this.sseClients.delete(writer)
    })
  }
}
```

For GET /api/events: create a TransformStream, add the writable side to sseClients, return a Response with the readable side, Content-Type: text/event-stream, and Cache-Control: no-cache.

---

### Step 3: `cli/src/agentation-api.ts` — New Hono sub-app

This is the routing layer between Agentation's HTTP calls and CommentRoom DO:

```ts
import { Hono } from "hono"

const api = new Hono<{ Bindings: Bindings; Variables: { userId: string } }>()

// Helper: get DO stub for a session (session ID = diff ID)
function getStub(c, sessionId: string) {
  const id = c.env.CommentRoom.idFromName(sessionId)
  return c.env.CommentRoom.get(id)
}

// Health check (Agentation polls this every 10s)
api.get("/health", (c) => c.json({ status: "ok" }))

// Status
api.get("/status", (c) => c.json({ version: "1.0", storage: "cloudflare-do" }))

// Create session (Agentation calls POST /sessions with { url })
api.post("/sessions", async (c) => {
  const { url } = await c.req.json()
  const match = url?.match(/\/v\/([a-f0-9]{16,32})/)
  const sessionId = match?.[1] || crypto.randomUUID()
  const stub = getStub(c, sessionId)
  const resp = await stub.fetch(new Request("https://internal/api/session"))
  const session = await resp.json()
  return c.json({ id: sessionId, ...session })
})

// List sessions — return empty for v1
api.get("/sessions", async (c) => {
  return c.json({ sessions: [] })
})

// Get session with all annotations
api.get("/sessions/:id", async (c) => {
  const stub = getStub(c, c.req.param("id"))
  const resp = await stub.fetch(new Request("https://internal/api/session"))
  return new Response(resp.body, resp)
})

// Create annotation
api.post("/sessions/:id/annotations", async (c) => {
  const stub = getStub(c, c.req.param("id"))
  const body = await c.req.json()
  body.createdBy = body.createdBy || c.get("userId")
  const resp = await stub.fetch(new Request("https://internal/api/annotations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }))
  return new Response(resp.body, resp)
})

// Get/Update/Delete annotation
// Annotation IDs encode session: {sessionId}_{uuid}
api.get("/annotations/:id", async (c) => { /* parse sessionId, proxy */ })
api.patch("/annotations/:id", async (c) => { /* parse sessionId, proxy */ })
api.delete("/annotations/:id", async (c) => { /* parse sessionId, proxy */ })

// Thread messages
api.post("/annotations/:id/thread", async (c) => { /* parse sessionId, proxy */ })

// Pending
api.get("/sessions/:id/pending", async (c) => { /* proxy to DO */ })
api.get("/pending", async (c) => c.json({ count: 0, annotations: [] }))

// SSE events — proxy to DO's SSE endpoint
api.get("/sessions/:id/events", async (c) => {
  const stub = getStub(c, c.req.param("id"))
  const resp = await stub.fetch(new Request("https://internal/api/events"))
  return new Response(resp.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  })
})

export { api as agentationApi }
```

**Key design:** Encode session ID in annotation IDs (`{sessionId}_{uuid}`) so PATCH/DELETE/GET on `/annotations/:id` can route to the right DO without session context.

---

### Step 4: `cli/src/worker.tsx` — Mount Agentation API + update widget injection

**Add route group** (after existing /agents/* route):

```ts
import { agentationApi } from "./agentation-api.js"

app.route("/a", agentationApi)
```

**Update handleView** — change the injected snippet from:

```ts
const commentsSnippet = `
<link rel="stylesheet" href="/comments.css">
<script>window.__CRITIQUE_COMMENTS__=${configJson}</script>
<script src="/comments.js"></script>`
```

to:

```ts
const configJson = JSON.stringify({
  endpoint: origin + "/a",
  sessionId: id,
  userId: userId,
}).replace(/</g, "\\u003c")

const commentsSnippet = `
<script>window.__CRITIQUE_CONFIG__=${configJson}</script>
<script src="/agentation-widget.js"></script>`
```

No separate CSS file needed — Agentation bundles its styles inline.

---

### Step 5: `comments-client/src/widget.tsx` — Rewrite

```tsx
import { createRoot } from "react-dom/client"
import { Agentation } from "agentation"

interface CritiqueConfig {
  endpoint: string
  sessionId: string
  userId: string
}

function init() {
  if (document.getElementById("critique-agentation")) return
  const config = (window as any).__CRITIQUE_CONFIG__ as CritiqueConfig | undefined
  if (!config?.endpoint || !config?.sessionId) {
    console.warn("[critique] Missing window.__CRITIQUE_CONFIG__")
    return
  }
  const container = document.createElement("div")
  container.id = "critique-agentation"
  document.body.appendChild(container)
  createRoot(container).render(
    <Agentation
      endpoint={config.endpoint}
      sessionId={config.sessionId}
    />
  )
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init)
} else {
  init()
}
```

---

### Step 6: `comments-client/package.json` — Update deps

```json
{
  "name": "@critique.work/client",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "dependencies": {
    "agentation": "^2.2.1",
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  }
}
```

---

### Step 7: Root `package.json` — Update build script

```json
{
  "scripts": {
    "build:comments-widget": "bun build comments-client/src/widget.tsx --outfile cli/public/agentation-widget.js --minify --target browser",
    "build:comments-server": "bun run --filter '@critique.work/server' build"
  }
}
```

---

### Step 8: `cli/wrangler.jsonc` — Add migration

Add v2 migration tag. The schema change happens at SQL level in onStart(). Add data migration logic in onStart() that checks for old comments table and converts threads → annotations.

---

### Step 9: `cli/src/routes/annotations-context.tsx` — Annotations with context route

Route: `GET /v/:id/annotations`

1. Fetch all annotations from CommentRoom DO for session id
2. Fetch the diff HTML from KV
3. For each annotation, use nearbyText and elementPath for context
4. Return as HTML page (or JSON with `?format=json`)

For v1: render annotations as a list with comment, elementPath, nearbyText, intent, severity, status, and thread messages. Link back to `/v/:id`.

---

### Step 10: Delete old code

Remove all files listed in the Deleted table.

---

## Data Migration Strategy

In onStart():

1. Check if old `comments` table exists: `SELECT name FROM sqlite_master WHERE type='table' AND name='comments'`
2. If yes: read threads from state + comments from SQL
3. Convert each thread → annotation, each comment → thread_message
4. Insert into new tables
5. Drop old comments table
6. `setState({ annotations: [...converted] })`

**Caveat:** y coordinate can't be perfectly recovered from fractional offsets. Agentation will use elementPath for positioning on next load.

---

## Execution Order

| # | Task | Files | Depends on |
|---|---|---|---|
| 1 | Fork agentation, add SSE event handlers | external repo | — |
| 2 | Rewrite types.ts with AFS types | comments-server/src/types.ts | — |
| 3 | Rewrite comment-room.ts with new schema + API | comments-server/src/comment-room.ts | #2 |
| 4 | Create agentation-api.ts | cli/src/agentation-api.ts | #3 |
| 5 | Update cli/src/worker.tsx (mount /a, update handleView) | cli/src/worker.tsx | #4 |
| 6 | Rewrite widget.tsx | comments-client/src/widget.tsx | #1 |
| 7 | Update comments-client/package.json | comments-client/package.json | #1 |
| 8 | Update root package.json build scripts | package.json | #6, #7 |
| 9 | Update wrangler.jsonc migration | cli/wrangler.jsonc | #3 |
| 10 | Delete old components/styles/hooks | comments-client/src/ | #6 |
| 11 | Build annotation context route | cli/src/routes/annotations-context.tsx | #3, #5 |
| 12 | Test end-to-end | — | all |

---

## Tests to Validate

1. **Widget loads on diff page** — visit /v/:id, Agentation toolbar appears
2. **Create annotation** — click element, type comment, submit → persists on refresh
3. **Multi-user sync** — open same diff in two browsers, annotation appears in other via SSE
4. **Thread replies** — click annotation marker, write reply → persists
5. **Resolve/dismiss** — resolve annotation → marker disappears on other clients
6. **Annotations context page** — visit /v/:id/annotations → see all annotations with context
7. **MCP compatibility** — run `npx agentation-mcp server --mcp-only --http-url https://critique.work/a` → works
8. **Data migration** — deploy to existing DO with v1 data → old threads appear as annotations

---

## Open Questions

1. **annotations/:id routing without session ID** — Encode session ID in annotation IDs (`{sessionId}_{uuid}`). Verify Agentation doesn't modify the ID.
2. **Agentation fork vs monkey-patch** — Fork is cleaner. Monkey-patching EventSource is messier but avoids fork maintenance.
3. **Bundle size** — Measure agentation bundle size. Lazy-load if too heavy.
4. **Licensing** — Agentation requires commercial license for redistribution in products. Contact team or assess if bundling as dependency is covered.
5. **GET /sessions (list all)** — Return empty for v1. Track session IDs in KV for v2.
