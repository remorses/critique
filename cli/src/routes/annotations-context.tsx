/** @jsxImportSource hono/jsx */
// Route: GET /v/:id/annotations
// Returns all annotations for a diff with surrounding context.
// Supports ?format=json for machine-readable output, otherwise renders HTML.

import { Hono } from "hono"
import type { KVNamespace } from "@cloudflare/workers-types"

type Bindings = {
  CRITIQUE_KV: KVNamespace
  CommentRoom: {
    idFromName(name: string): { toString(): string }
    get(id: { toString(): string }): {
      fetch(request: Request): Promise<Response>
    }
  }
}

const route = new Hono<{ Bindings: Bindings }>()

route.get("/v/:id/annotations", async (c) => {
  const id = c.req.param("id")

  if (!id || !/^[a-f0-9]{16,32}$/.test(id)) {
    return c.text("Invalid ID", 400)
  }

  // Fetch annotations from CommentRoom DO
  // x-partykit-room header required by agents SDK (partyserver) to initialize DO name
  const doId = c.env.CommentRoom.idFromName(id)
  const stub = c.env.CommentRoom.get(doId)
  const req = new Request("https://internal/api/annotations")
  req.headers.set("x-partykit-room", id)
  const resp = await stub.fetch(req)
  const annotations = (await resp.json()) as Array<{
    id: string
    comment: string
    elementPath: string
    nearbyText?: string
    selectedText?: string
    anchor?: string
    intent?: string
    severity?: string
    status?: string
    authorId?: string
    userName?: string
    createdAt?: string
    thread?: Array<{ role: string; content: string; timestamp: number }>
  }>

  const format = c.req.query("format")

  // JSON format for agents/bots
  if (format === "json") {
    return c.json({
      diffId: id,
      diffUrl: `${new URL(c.req.url).origin}/v/${id}`,
      count: annotations.length,
      annotations,
    })
  }

  // HTML format for humans
  const origin = new URL(c.req.url).origin
  return c.html(
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Annotations — {id.slice(0, 8)}</title>
        <style>{`
          body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; background: #0f1419; color: #e6edf3; margin: 0; padding: 24px; }
          .header { max-width: 720px; margin: 0 auto 24px; }
          .header h1 { font-size: 20px; margin: 0 0 8px; }
          .header a { color: #58a6ff; text-decoration: none; font-size: 14px; }
          .header a:hover { text-decoration: underline; }
          .count { color: #8b949e; font-size: 14px; margin-bottom: 24px; }
          .annotation { max-width: 720px; margin: 0 auto 20px; background: #151b23; border: 1px solid #2d3440; border-radius: 10px; padding: 16px; }
          .meta { display: flex; gap: 12px; align-items: center; margin-bottom: 8px; font-size: 13px; color: #8b949e; }
          .badge { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
          .badge-pending { background: #1f3044; color: #58a6ff; }
          .badge-resolved { background: #1a3520; color: #3fb950; }
          .badge-dismissed { background: #3d1f20; color: #f85149; }
          .badge-acknowledged { background: #3b2e1a; color: #d29922; }
          .badge-blocking { background: #3d1f20; color: #f85149; }
          .badge-important { background: #3b2e1a; color: #d29922; }
          .badge-suggestion { background: #1f3044; color: #58a6ff; }
          .comment { font-size: 15px; line-height: 1.6; margin: 8px 0; }
          .context { font-size: 13px; color: #8b949e; margin-top: 8px; }
          .context code { background: #1c2128; padding: 2px 6px; border-radius: 4px; font-family: ui-monospace, monospace; }
          .thread { margin-top: 12px; border-top: 1px solid #2d3440; padding-top: 12px; }
          .thread-msg { margin-bottom: 8px; font-size: 13px; }
          .thread-role { font-weight: 600; color: #58a6ff; }
          .thread-role.agent { color: #d29922; }
          .empty { max-width: 720px; margin: 40px auto; text-align: center; color: #8b949e; }
        `}</style>
      </head>
      <body>
        <div class="header">
          <h1>Annotations</h1>
          <a href={`${origin}/v/${id}`}>Back to diff</a>
          <div class="count">{annotations.length} annotation{annotations.length !== 1 ? "s" : ""}</div>
        </div>
        {annotations.length === 0 ? (
          <div class="empty">No annotations yet</div>
        ) : (
          annotations.map((ann) => (
            <div class="annotation" key={ann.id}>
              <div class="meta">
                {ann.userName && <span>{ann.userName}</span>}
                {ann.status && (
                  <span class={`badge badge-${ann.status}`}>{ann.status}</span>
                )}
                {ann.severity && (
                  <span class={`badge badge-${ann.severity}`}>{ann.severity}</span>
                )}
                {ann.intent && <span>{ann.intent}</span>}
                {ann.createdAt && (
                  <span>{new Date(ann.createdAt).toLocaleString()}</span>
                )}
              </div>
              <div class="comment">{ann.comment}</div>
              {(ann.elementPath || ann.anchor || ann.nearbyText || ann.selectedText) && (
                <div class="context">
                  {ann.anchor && (
                    <div>Anchor: <code>{ann.anchor}</code></div>
                  )}
                  {ann.elementPath && (
                    <div>Element: <code>{ann.elementPath}</code></div>
                  )}
                  {ann.selectedText && (
                    <div>Selected: "{ann.selectedText}"</div>
                  )}
                  {ann.nearbyText && (
                    <div>Nearby: "{ann.nearbyText}"</div>
                  )}
                </div>
              )}
              {ann.thread && ann.thread.length > 0 && (
                <div class="thread">
                  {ann.thread.map((msg, i) => (
                    <div class="thread-msg" key={i}>
                      <span class={`thread-role ${msg.role}`}>{msg.role}:</span>{" "}
                      {msg.content}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </body>
    </html>,
  )
})

export { route as annotationsContextRoute }
