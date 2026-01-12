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

// Detect if request is from a mobile device
function isMobileDevice(c: { req: { header: (name: string) => string | undefined } }): boolean {
  // Check CF-Device-Type header (Cloudflare provides this on Enterprise/APO)
  const cfDeviceType = c.req.header("CF-Device-Type")
  if (cfDeviceType === "mobile" || cfDeviceType === "tablet") {
    return true
  }
  if (cfDeviceType === "desktop") {
    return false
  }

  // Check Sec-CH-UA-Mobile header (Chromium browsers only)
  const secChUaMobile = c.req.header("Sec-CH-UA-Mobile")
  if (secChUaMobile === "?1") {
    return true
  }
  if (secChUaMobile === "?0") {
    return false
  }

  // Fallback to User-Agent parsing with comprehensive regex
  const userAgent = c.req.header("User-Agent") || ""
  
  // Comprehensive mobile detection regex (case-insensitive)
  const mobileRegex = /Mobile|iP(hone|od|ad)|Android|BlackBerry|IEMobile|Kindle|Silk|NetFront|Opera M(obi|ini)|Windows Phone|webOS|Fennec|Minimo|UCBrowser|UCWEB|SonyEricsson|Symbian|Nintendo|PSP|PlayStation|MIDP|CLDC|AvantGo|Maemo|PalmOS|PalmSource|DoCoMo|UP\.Browser|Blazer|Xiino|OneBrowser/i
  
  return mobileRegex.test(userAgent)
}

// Upload HTML content
// POST /upload with JSON body { html: string, htmlMobile?: string }
// Returns { id: string, url: string }
app.post("/upload", async (c) => {
  try {
    const body = await c.req.json<{ html: string; htmlMobile?: string }>()

    if (!body.html || typeof body.html !== "string") {
      return c.json({ error: "Missing or invalid 'html' field" }, 400)
    }

    // Generate hash of the desktop HTML content as the key (enables caching/deduplication)
    const encoder = new TextEncoder()
    const data = encoder.encode(body.html)
    const hashBuffer = await crypto.subtle.digest("SHA-256", data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("")

    // Use first 32 chars of hash as ID (128 bits, secure against guessing)
    const id = hashHex.slice(0, 32)

    // Store desktop version in KV with 7 day expiration
    await c.env.CRITIQUE_KV.put(id, body.html, {
      expirationTtl: 60 * 60 * 24 * 7, // 7 days
    })

    // Store mobile version if provided
    if (body.htmlMobile && typeof body.htmlMobile === "string") {
      await c.env.CRITIQUE_KV.put(`${id}-mobile`, body.htmlMobile, {
        expirationTtl: 60 * 60 * 24 * 7, // 7 days
      })
    }

    const url = new URL(c.req.url)
    const viewUrl = `${url.origin}/v/${id}`

    return c.json({ id, url: viewUrl })
  } catch (error) {
    return c.json({ error: "Failed to process upload" }, 500)
  }
})

// View HTML content with streaming
// GET /v/:id (short) or /view/:id (legacy)
// Query params: ?v=desktop or ?v=mobile to select version
// Server redirects mobile devices to ?v=mobile, client JS also handles redirect
async function handleView(c: any) {
  const id = c.req.param("id")

  if (!id || !/^[a-f0-9]{16,32}$/.test(id)) {
    return c.text("Invalid ID", 400)
  }

  // Check for version query param
  const version = c.req.query("v")
  
  // If no version specified and mobile device detected, redirect to ?v=mobile
  // This is a fallback - client JS also handles this redirect
  if (!version && isMobileDevice(c)) {
    const url = new URL(c.req.url)
    url.searchParams.set("v", "mobile")
    return c.redirect(url.toString(), 302)
  }

  // Serve the appropriate version based on query param
  const isMobile = version === "mobile"
  let html: string | null = null
  
  if (isMobile) {
    // Try mobile version first, fall back to desktop
    html = await c.env.CRITIQUE_KV.get(`${id}-mobile`)
    if (!html) {
      html = await c.env.CRITIQUE_KV.get(id)
    }
  } else {
    html = await c.env.CRITIQUE_KV.get(id)
  }

  if (!html) {
    return c.text("Not found", 404)
  }

  // Stream the HTML content for faster initial load
  return stream(c, async (s) => {
    c.header("Content-Type", "text/html; charset=utf-8")
    // Cache is now safe - URL determines content, no Vary needed
    c.header("Cache-Control", "public, max-age=86400")

    // Stream in chunks for better performance
    const chunkSize = 16 * 1024 // 16KB chunks
    let offset = 0

    while (offset < html.length) {
      const chunk = html.slice(offset, offset + chunkSize)
      await s.write(chunk)
      offset += chunkSize
    }
  })
}

app.get("/v/:id", handleView)
app.get("/view/:id", handleView)

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
// HEAD /v/:id or /view/:id
async function handleHead(c: any) {
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
}

app.on("HEAD", "/v/:id", handleHead)
app.on("HEAD", "/view/:id", handleHead)

export default app
