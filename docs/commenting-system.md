---
title: Commenting System (Agentation)
description: How annotations work on critique diff pages — from widget injection to Durable Object persistence.
---

# Commenting System

Critique diff pages at `critique.work/v/<id>` support inline annotations powered by the [agentation](https://www.npmjs.com/package/agentation) npm package and a Cloudflare Durable Object backend.

## Architecture

```
Browser                        Cloudflare Worker               Durable Object
                               (critique-web)                  (CommentRoom)
                                                              
  GET /v/<id>  ──────────────>  handleView()                  
                                  │                            
                                  ├─ Fetch HTML from KV        
                                  ├─ Size check (< 1MB?)       
                                  │   YES: inject widget       
                                  │   NO:  skip widget         
                                  └─ Stream response           
                                                              
  Widget loads ───────────────> GET /agentation-widget.js      
                                  (static asset)               
                                                              
  <Agentation/> ─── REST ────> /a/sessions/<id>/annotations   
                                  │                            
                                  └─ agentation-api.ts         
                                       │ proxy + headers       
                                       v                       
                                  CommentRoom DO               
                                    ├─ SQLite (annotations)    
                                    ├─ SQLite (thread_messages)
                                    ├─ WebSocket (cursors)     
                                    └─ SSE (live updates)      
```

## Request flow

**1. Page load** — When a user visits `/v/<id>`, the worker's `handleView()` fetches the diff HTML from KV. If the HTML is under 1MB, it injects two things before `</body>`:

```html
<script>window.__CRITIQUE_CONFIG__={"endpoint":"https://critique.work/a","sessionId":"<id>","userId":"<cookie>"}</script>
<script src="/agentation-widget.js"></script>
```

Large diffs (> 1MB) skip widget injection entirely. Agentation's CSS (365 rules) causes Safari to re-evaluate style matching on all DOM nodes, which is prohibitively slow on diffs with 185K+ elements.

**2. Widget init** — `agentation-widget.js` is a bundled React app (`comments-client/src/widget.tsx`). On load it:

- Injects `content-visibility: auto` CSS on `.line` elements (off-screen rendering optimization)
- If `@scope` is supported (Safari 17.4+, Chrome 118+) and `#content` exists, monkey-patches `Node.prototype.appendChild` to wrap agentation's injected `<style>` blocks in `@scope (body) to (#content)` — this excludes the diff subtree from CSS selector matching
- Dynamically imports `agentation` (dynamic import ensures the monkey-patch is active before agentation's module-level style injection runs)
- Renders `<Agentation endpoint="..." sessionId="..." />` into a container div

**3. Agentation UI** — The agentation component renders:

- A **toolbar** (bottom-right) — portaled to `document.body` via `ReactDOM.createPortal`
- **Marker layers** — for pinned annotation positions on the page
- **Annotation popups** — for viewing/editing annotations

**4. API calls** — When a user creates/edits/deletes an annotation, the agentation client sends REST requests to the endpoint (`/a/...`).

## API layer (`cli/src/agentation-api.ts`)

A Hono sub-app mounted at `/a` on the main worker. It proxies all requests to the CommentRoom Durable Object.

Every proxied request must include an `x-partykit-room` header set to the session ID. This is required by the `agents` npm package (built on `partyserver`) — without it the DO throws "Missing namespace or room headers". The `proxyToDO()` helper handles this.

**Routes:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/sessions` | Create session (extracts diff ID from URL) |
| GET | `/sessions/:id` | Get session with all annotations |
| POST | `/sessions/:id/annotations` | Create annotation |
| POST | `/sessions/:id/action` | Submit "Send Annotations" action request |
| GET | `/annotations/:id` | Get single annotation |
| PATCH | `/annotations/:id` | Update annotation |
| DELETE | `/annotations/:id` | Delete annotation |
| POST | `/annotations/:id/thread` | Add thread message |
| GET | `/sessions/:id/events` | SSE stream for live updates |
| GET | `/sessions/:id/pending` | List pending annotations |

**Annotation ID format:** `{sessionId}_{uuid}` — the session ID prefix allows routing annotation requests to the correct DO without a separate session lookup.

## Durable Object (`comments-server/src/comment-room.ts`)

`CommentRoom` extends `Agent` from the `agents` npm package. Each diff page gets its own DO instance, identified by the diff ID.

**Storage:** Embedded SQLite with two tables:

- `annotations` — id, comment, elementPath, position (x/y), element metadata, status, intent, severity, user info, timestamps, and a `fullJson` column storing the complete annotation object
- `thread_messages` — id, annotationId (FK), role (human/agent), content, timestamp

**State sync:** The DO maintains an in-memory `RoomState` (array of annotations) synced via the agents framework's state system. Connected WebSocket clients receive state updates automatically.

**SSE:** The DO maintains a set of SSE writer streams. When annotations are created/updated/deleted, thread messages are added, or submit actions are requested, events are emitted to all connected SSE clients. Event types: `annotation.created`, `annotation.updated`, `annotation.deleted`, `thread.message`, `action.requested`.

**WebSocket:** Used for cursor presence (multi-user live cursors). Cursor position messages are broadcast to all other connections.

## Annotations context page (`cli/src/routes/annotations-context.tsx`)

A separate route at `GET /v/:id/annotations` that returns all annotations for a diff:

- `?format=json` — machine-readable JSON for agents/bots
- Default — styled HTML page listing all annotations with metadata, thread messages, and context

## Performance optimizations

**CSS class deduplication** (`cli/src/ansi-html.ts`) — Instead of inline `style="color:#xxx;background-color:#yyy"` on every span (185K spans = ~10MB of style attributes), unique style combos are collected into a `StyleClassMap` and emitted as CSS classes (`.s0`, `.s1`, etc.). Typically 50-200 unique classes. Reduces HTML from ~13MB to ~6.6MB on large diffs.

**content-visibility** — The base CSS in `ansi-html.ts` includes `content-visibility: auto` on `.line` elements so the browser skips layout/paint for off-screen lines. Disabled on iOS Safari via `@supports (-webkit-touch-callout: none)` due to rendering issues.

**@scope CSS isolation** — The widget wraps agentation's component CSS in `@scope (body) to (#content)` so Safari excludes the diff subtree (`#content` and its 185K descendants) from selector matching when agentation's 365 CSS rules are injected.

**Size-gated widget** — Agentation is only injected on diffs under 1MB HTML. Large diffs skip the widget entirely to avoid any CSS/JS overhead.

## Packages

| Package | Path | Description |
|---------|------|-------------|
| `@critique.work/server` | `comments-server/` | CommentRoom DO + Hono worker |
| `@critique.work/client` | `comments-client/` | Widget entry point, bundles agentation |
| `critique` (CLI) | `cli/` | Main worker, agentation API proxy, HTML generation |

## Config

**Wrangler** (`cli/wrangler.jsonc`):

- `CommentRoom` DO binding with SQLite migration (tag v1)
- Preview environment at `preview.critique.work` with its own KV + DO bindings
- Production at `critique.work`

**Secrets** (uploaded via `wrangler secret bulk`):

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — payments
- `PUBLIC_URL` — canonical URL
- `RESEND_API_KEY`, `RESEND_FROM` — email (license delivery)

These are shared between preview and production environments.
