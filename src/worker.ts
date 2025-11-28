import { Hono } from "hono"
import { cors } from "hono/cors"
import { stream } from "hono/streaming"
import type { KVNamespace } from "@cloudflare/workers-types"

type Bindings = {
  CRITIQUE_KV: KVNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS for all routes
app.use("*", cors())

// Redirect to GitHub repo
app.get("/", (c) => {
  return c.redirect("https://github.com/remorses/critique")
})

// Upload HTML content
// POST /upload with JSON body { html: string }
// Returns { id: string, url: string }
app.post("/upload", async (c) => {
  try {
    const body = await c.req.json<{ html: string }>()

    if (!body.html || typeof body.html !== "string") {
      return c.json({ error: "Missing or invalid 'html' field" }, 400)
    }

    // Generate hash of the HTML content as the key (enables caching/deduplication)
    const encoder = new TextEncoder()
    const data = encoder.encode(body.html)
    const hashBuffer = await crypto.subtle.digest("SHA-256", data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("")

    // Use first 32 chars of hash as ID (128 bits, secure against guessing)
    const id = hashHex.slice(0, 32)

    // Store in KV with 7 day expiration
    await c.env.CRITIQUE_KV.put(id, body.html, {
      expirationTtl: 60 * 60 * 24 * 7, // 7 days
    })

    const url = new URL(c.req.url)
    const viewUrl = `${url.origin}/view/${id}`

    return c.json({ id, url: viewUrl })
  } catch (error) {
    return c.json({ error: "Failed to process upload" }, 500)
  }
})

// View HTML content with streaming
// GET /view/:id
app.get("/view/:id", async (c) => {
  const id = c.req.param("id")

  if (!id || !/^[a-f0-9]{16,32}$/.test(id)) {
    return c.text("Invalid ID", 400)
  }

  const html = await c.env.CRITIQUE_KV.get(id)

  if (!html) {
    return c.text("Not found", 404)
  }

  // Stream the HTML content for faster initial load
  return stream(c, async (s) => {
    // Set content type header
    c.header("Content-Type", "text/html; charset=utf-8")
    c.header("Cache-Control", "public, max-age=3600")

    // Stream in chunks for better performance
    const chunkSize = 16 * 1024 // 16KB chunks
    let offset = 0

    while (offset < html.length) {
      const chunk = html.slice(offset, offset + chunkSize)
      await s.write(chunk)
      offset += chunkSize
    }
  })
})

// Get raw HTML content (for debugging/API access)
// GET /raw/:id
app.get("/raw/:id", async (c) => {
  const id = c.req.param("id")

  if (!id || !/^[a-f0-9]{16,32}$/.test(id)) {
    return c.json({ error: "Invalid ID" }, 400)
  }

  const html = await c.env.CRITIQUE_KV.get(id)

  if (!html) {
    return c.json({ error: "Not found" }, 404)
  }

  return c.text(html, 200, {
    "Content-Type": "text/html; charset=utf-8",
  })
})

// Check if content exists
// HEAD /view/:id
app.on("HEAD", "/view/:id", async (c) => {
  const id = c.req.param("id")

  if (!id || !/^[a-f0-9]{16,32}$/.test(id)) {
    return c.body(null, 400)
  }

  const html = await c.env.CRITIQUE_KV.get(id)

  if (!html) {
    return c.body(null, 404)
  }

  c.header("Content-Length", String(html.length))
  return c.body(null, 200)
})

export default app
