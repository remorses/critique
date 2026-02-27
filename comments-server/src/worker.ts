// Hono worker for the annotation system.
// Handles cookie-based user identity and provides an HTTP API for fetching annotations.

import { Hono } from "hono"
import { cors } from "hono/cors"

// Re-export so wrangler can find the Durable Object class when using this module as main
export { CommentRoom } from "./comment-room.js"

export interface CommentWorkerEnv {
  CommentRoom: {
    idFromName(name: string): { toString(): string }
    get(id: { toString(): string }): {
      fetch(request: Request): Promise<Response>
    }
  }
}

export function createCommentsWorker() {
  const app = new Hono<{ Bindings: CommentWorkerEnv; Variables: { userId: string } }>()

  app.use("*", cors())

  // Cookie-based identity: assign a persistent user ID on first visit
  app.use("*", async (c, next) => {
    const cookieHeader = c.req.header("Cookie") || ""
    const cookies = parseCookies(cookieHeader)
    let userId = cookies["cw_user_id"]

    if (!userId) {
      userId = crypto.randomUUID()
      c.header(
        "Set-Cookie",
        `cw_user_id=${userId}; Path=/; Max-Age=${60 * 60 * 24 * 365 * 10}; SameSite=Lax; HttpOnly`,
      )
    }

    c.set("userId", userId)
    await next()
  })

  // Health check
  app.get("/health", (c) => c.json({ ok: true }))

  // HTTP API: get all annotations for a room key
  app.get("/api/annotations", async (c) => {
    const key = c.req.query("key")
    if (!key) {
      return c.json({ error: "Missing ?key parameter" }, 400)
    }

    const id = c.env.CommentRoom.idFromName(key)
    const stub = c.env.CommentRoom.get(id)
    const request = new Request("https://internal/api/annotations", { method: "GET" })
    request.headers.set("x-partykit-room", key)
    const response = await stub.fetch(request)
    const data = await response.json()
    return c.json(data)
  })

  return app
}

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {}
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=")
    if (key) {
      cookies[key.trim()] = rest.join("=").trim()
    }
  }
  return cookies
}

// Default export for standalone deployment
const app = createCommentsWorker()
export default app
