/** @jsxImportSource hono/jsx */
// Cloudflare Worker for hosting HTML diff previews at critique.work.
// Handles upload, storage (KV), Stripe checkout, and responsive serving.
// Endpoints: POST /upload, GET /v/:id (view), GET /raw/:id (debug).
// Payments: GET /buy, GET /success, POST /stripe/webhook.

import { Hono } from "hono"
import { cors } from "hono/cors"
import { stream } from "hono/streaming"
import type { KVNamespace } from "@cloudflare/workers-types"
import Stripe from "stripe"
import { Resend } from "resend"

type Bindings = {
  CRITIQUE_KV: KVNamespace
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string
  PUBLIC_URL?: string
  RESEND_API_KEY?: string
  RESEND_FROM?: string
}

type LicenseRecord = {
  status: "active" | "inactive" | "canceled"
  subscriptionId?: string
  customerId?: string
  createdAt: number
  updatedAt?: number
}

const app = new Hono<{ Bindings: Bindings }>()

const SEVEN_DAYS = 60 * 60 * 24 * 7
const LICENSE_HEADER = "X-Critique-License"
const OWNER_SECRET_HEADER = "X-Critique-Owner-Secret"
const STRIPE_YEARLY_PRICE_ID = "price_1Su9CZBekrVyz93iMIEnjPOk"

// Favicon PNGs (32x32) - dark (white icon for dark bg) and light (black icon for light bg)
const FAVICON_DARK_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAA8ElEQVR4nO2WPwrCMBhHSxVBvIR4CsHFQXsGt6KjJyiouOosOLgI7s4OjtrjODv450lLSjPFtjZRbB/8hi9pksdHCrGskgQAV95zAQaWDkjOHRjpEOgAPUX6gC8knsA4d4l3AA3gKHVj+slmfoq236LDgDpwkOZmWQWysBBra8BeGl+aEpAlKsCOmDVgmxAImEsSW2JWpgRkCRvYhCPwMCkQMBF7dcMKyFNgKKLiplOgKaLk7wRcoCVSFYlqtxACMsW8A2l/Q60Cifg7AUfxvWNCwFM8yTwTAqn5FYG2KK9fEcgEpQCcc2jCKVv/rYLxAsud37oBTmHeAAAAAElFTkSuQmCC"
const FAVICON_LIGHT_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAA8klEQVR4nO2WPQrCQBCFP1QE8RLiKQQbC/UMdqKlJxBUbLUWLGwEe2sLS/U41hb+jAgjTJXE1WzE+ODB5mV38mWWhYW/oukESIiPQIuYJBF9AbpxAFSBeoAbwEEhbkCPBFQEtqYbw3eKHV5o+9l8rABszLuRK4A4eKJr88Da5FNfAGIgssDK5HMg4wNAgLGBWJp85gtADMTjrxeaXX0CCDDQWjWTfQygow47HbEBlNRh834LoA2U1Tn187mdCgBJegvkmwA6EY5hrAAS0b8F0AyY3/QB0A+4kvVTsQXiCFDR8SkpACdJ6gH2H+jAzq35pEx3Rh7HfgGTRuMAAAAASUVORK5CYII="

const logger = {
  log: (...args: unknown[]) => {
    console.error(...args)
  },
}

// Enable CORS for all routes
app.use("*", cors())

// Redirect to GitHub repo
app.get("/", (c) => {
  return c.redirect("https://github.com/remorses/critique")
})

// Serve favicon - dark version (white icon for dark backgrounds)
app.get("/favicon-dark.png", (c) => {
  const bytes = Uint8Array.from(atob(FAVICON_DARK_BASE64), (c) => c.charCodeAt(0))
  return c.body(bytes, 200, {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=604800",
  })
})

// Serve favicon - light version (black icon for light backgrounds)
app.get("/favicon-light.png", (c) => {
  const bytes = Uint8Array.from(atob(FAVICON_LIGHT_BASE64), (c) => c.charCodeAt(0))
  return c.body(bytes, 200, {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=604800",
  })
})

// Default favicon.ico - returns dark version
app.get("/favicon.ico", (c) => {
  const bytes = Uint8Array.from(atob(FAVICON_DARK_BASE64), (c) => c.charCodeAt(0))
  return c.body(bytes, 200, {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=604800",
  })
})

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing env var ${name}`)
  }
  return value
}

function getPublicUrl(c: { req: { url: string }; env: Bindings }): string {
  return c.env.PUBLIC_URL || new URL(c.req.url).origin
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

async function computeStripeSignature(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload))
  return toHex(signature)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

function parseStripeSignature(header: string): { timestamp: string; signatures: string[] } | null {
  const parts = header.split(",")
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2)
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))
  if (!timestamp || signatures.length === 0) return null
  return { timestamp, signatures }
}

async function verifyStripeSignature(body: string, header: string, secret: string): Promise<boolean> {
  const parsed = parseStripeSignature(header)
  if (!parsed) return false
  const payload = `${parsed.timestamp}.${body}`
  const expected = await computeStripeSignature(secret, payload)
  return parsed.signatures.some((sig) => timingSafeEqual(sig, expected))
}

class CritiqueKv {
  private kv: KVNamespace

  constructor(kv: KVNamespace) {
    this.kv = kv
  }

  async getHtml(id: string): Promise<string | null> {
    return this.kv.get(id)
  }

  async setHtml(id: string, html: string, ttlSeconds?: number): Promise<void> {
    await this.kv.put(id, html, ttlSeconds ? { expirationTtl: ttlSeconds } : undefined)
  }

  async getMobileHtml(id: string): Promise<string | null> {
    return this.kv.get(`${id}-mobile`)
  }

  async setMobileHtml(id: string, html: string, ttlSeconds?: number): Promise<void> {
    await this.kv.put(`${id}-mobile`, html, ttlSeconds ? { expirationTtl: ttlSeconds } : undefined)
  }

  async getOgImage(id: string): Promise<ArrayBuffer | null> {
    return this.kv.get(`og-${id}`, "arrayBuffer")
  }

  async setOgImage(id: string, bytes: ArrayBuffer, ttlSeconds?: number): Promise<void> {
    await this.kv.put(`og-${id}`, bytes, ttlSeconds ? { expirationTtl: ttlSeconds } : undefined)
  }

  async getLicense(key: string): Promise<LicenseRecord | null> {
    const raw = await this.kv.get(`license:${key}`)
    return safeJsonParse<LicenseRecord>(raw)
  }

  async setLicense(key: string, record: LicenseRecord): Promise<void> {
    await this.kv.put(`license:${key}`, JSON.stringify(record))
  }

  async getCheckoutLicense(sessionId: string): Promise<string | null> {
    return this.kv.get(`checkout:${sessionId}`)
  }

  async setCheckoutLicense(sessionId: string, licenseKey: string): Promise<void> {
    await this.kv.put(`checkout:${sessionId}`, licenseKey)
  }

  async getSubscriptionLicense(subscriptionId: string): Promise<string | null> {
    return this.kv.get(`subscription:${subscriptionId}`)
  }

  async setSubscriptionLicense(subscriptionId: string, licenseKey: string): Promise<void> {
    await this.kv.put(`subscription:${subscriptionId}`, licenseKey)
  }

  async getOwnerSecret(id: string): Promise<string | null> {
    return this.kv.get(`owner:${id}`)
  }

  async setOwnerSecret(id: string, secret: string, ttlSeconds?: number): Promise<void> {
    await this.kv.put(`owner:${id}`, secret, ttlSeconds ? { expirationTtl: ttlSeconds } : undefined)
  }

  async deleteAll(id: string): Promise<void> {
    await Promise.all([
      this.kv.delete(id),
      this.kv.delete(`${id}-mobile`),
      this.kv.delete(`og-${id}`),
      this.kv.delete(`owner:${id}`),
    ])
  }
}

function generateLicenseKey(): string {
  const raw = crypto.randomUUID().replace(/-/g, "")
  return `critique_${raw}`
}

function buildLicenseCommand(licenseKey: string): string {
  return `npx critique login ${licenseKey}`
}

async function sendLicenseEmail(
  env: Bindings,
  email: string,
  licenseKey: string
): Promise<void> {
  const apiKey = env.RESEND_API_KEY
  const from = env.RESEND_FROM
  if (!apiKey || !from) {
    logger.log("Resend not configured; skipping email", {
      hasApiKey: Boolean(apiKey),
      hasFrom: Boolean(from),
    })
    return
  }

  const command = buildLicenseCommand(licenseKey)
  const resend = new Resend(apiKey)
  const subject = "Your Critique license key"
  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; color: #0f172a;">
      <p>Thanks for subscribing to Critique.</p>
      <p>Run this on any machine where you want to use critique:</p>
      <pre style="background: #0b1117; color: #e6edf3; padding: 12px 14px; border-radius: 8px; font-family: 'Courier New', Courier, monospace;">${command}</pre>
      <p>This unlocks permanent critique links.</p>
    </div>
  `
  const text = `Thanks for subscribing to Critique.\n\nRun this on any machine where you want to use critique:\n${command}\n\nThis unlocks permanent critique links.`

  const { error } = await resend.emails.send({
    from,
    to: [email],
    replyTo: ["tommy@unframer.co"],
    tags: [
      {
        name: "critique",
        value: "license",
      },
    ],
    subject,
    html,
    text,
  })

  if (error) {
    logger.log("Resend email failed", { message: error.message })
  }
}

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

// Inject OG image meta tags into HTML
function injectOgTags(html: string, ogImageUrl: string, title: string): string {
  const ogTags = `
<meta property="og:title" content="${title}">
<meta property="og:type" content="website">
<meta property="og:image" content="${ogImageUrl}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:image" content="${ogImageUrl}">`

  // Insert after <meta name="viewport"...> or before </head>
  if (html.includes('name="viewport"')) {
    return html.replace(
      /(<meta[^>]*name="viewport"[^>]*>)/i,
      `$1${ogTags}`
    )
  }
  return html.replace("</head>", `${ogTags}\n</head>`)
}


// Extract title from HTML
function extractTitle(html: string): string {
  const match = html.match(/<title>([^<]*)<\/title>/i)
  return match?.[1] ?? "Critique Diff"
}

// Upload HTML content
// POST /upload with JSON body { html: string, htmlMobile?: string, ogImage?: string (base64) }
// Returns { id: string, url: string, ogImageUrl?: string }
app.post("/upload", async (c) => {
  try {
    const kv = new CritiqueKv(c.env.CRITIQUE_KV)
    const body = await c.req.json<{ html: string; htmlMobile?: string; ogImage?: string }>()

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

    const url = new URL(c.req.url)
    let ogImageUrl: string | undefined

    const licenseKey = c.req.header(LICENSE_HEADER)
    const ownerSecret = c.req.header(OWNER_SECRET_HEADER)
    const license = licenseKey ? await kv.getLicense(licenseKey) : null
    const hasActiveLicense = license?.status === "active"
    const ttlSeconds = hasActiveLicense ? undefined : SEVEN_DAYS

    // Store owner secret for deletion authentication
    if (ownerSecret) {
      await kv.setOwnerSecret(id, ownerSecret, ttlSeconds)
    }

    // Store OG image if provided
    if (body.ogImage && typeof body.ogImage === "string") {
      // Decode base64 to binary
      const binaryString = atob(body.ogImage)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      // Store as binary in KV
      await kv.setOgImage(id, bytes.buffer, ttlSeconds)

      ogImageUrl = `${url.origin}/og/${id}.png`
    }

    // Inject OG tags into HTML if we have an OG image
    let htmlDesktop = body.html
    let htmlMobile = body.htmlMobile

    if (ogImageUrl) {
      const title = extractTitle(body.html)
      htmlDesktop = injectOgTags(htmlDesktop, ogImageUrl, title)
      htmlMobile = htmlMobile ? injectOgTags(htmlMobile, ogImageUrl, title) : htmlMobile
    }


    // Store desktop version in KV
    await kv.setHtml(id, htmlDesktop, ttlSeconds)

    // Store mobile version if provided
    if (htmlMobile && typeof htmlMobile === "string") {
      await kv.setMobileHtml(id, htmlMobile, ttlSeconds)
    }

    const viewUrl = `${url.origin}/v/${id}`

    return c.json({
      id,
      url: viewUrl,
      ogImageUrl,
      expiresInDays: hasActiveLicense ? null : 7,
    })
  } catch (error) {
    return c.json({ error: "Failed to process upload" }, 500)
  }
})

// Create Stripe checkout session for yearly subscription
app.get("/buy", async (c) => {
  try {
    const stripeSecret = requireEnv(c.env.STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY")
    const publicUrl = getPublicUrl(c)

    const email = c.req.query("email")
    const stripe = new Stripe(stripeSecret)
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      allow_promotion_codes: true,
      success_url: `${publicUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicUrl}/success?canceled=1`,
      line_items: [
        {
          price: STRIPE_YEARLY_PRICE_ID,
          quantity: 1,
        },
      ],
      customer_email: email || undefined,
    })
    if (!session.url) {
      return c.text("Stripe session missing redirect URL", 500)
    }

    return c.redirect(session.url, 303)
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      logger.log("Stripe checkout error", {
        type: error.type,
        code: error.code,
        message: error.message,
      })
      return c.text(`Failed to start checkout: ${error.message}`, 500)
    }
    logger.log("Stripe checkout error", error)
    return c.text("Failed to start checkout", 500)
  }
})

function SuccessPage({
  licenseKey,
  status,
  canceled,
}: {
  licenseKey?: string
  status?: string
  canceled?: boolean
}) {
  const title = canceled ? "Checkout canceled" : "Subscription status"
  const headline = canceled
    ? "Checkout canceled"
    : licenseKey
      ? "Your Critique license key"
      : "Subscription processing"
  const message = canceled
    ? "No charge was made. You can return anytime to subscribe."
    : licenseKey
      ? "Run this on any machine where you want to use critique."
      : "Your payment is confirmed. This page will update once the license is ready."

  const command = licenseKey ? buildLicenseCommand(licenseKey) : null

  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <style>{`
          body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; background: #0f1419; color: #e6edf3; margin: 0; }
          .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 32px; }
          .card { max-width: 560px; width: 100%; background: #151b23; border: 1px solid #2d3440; border-radius: 16px; padding: 28px; }
          h1 { font-size: 24px; margin: 0 0 12px; }
          p { color: #9aa4b2; margin: 0 0 20px; line-height: 1.5; }
          .key { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background: #0b1117; border: 1px solid #2d3440; padding: 12px 14px; border-radius: 10px; word-break: break-all; }
          .status { margin-top: 16px; font-size: 14px; color: #6b7280; }
        `}</style>
      </head>
      <body>
        <div class="wrap">
          <div class="card">
            <h1>{headline}</h1>
            <p>{message}</p>
            {command ? <div class="key">{command}</div> : null}
            {status ? <div class="status">Status: {status}</div> : null}
          </div>
        </div>
      </body>
    </html>
  )
}

app.get("/success", async (c) => {
  const sessionId = c.req.query("session_id")
  const canceled = c.req.query("canceled") === "1"

  const kv = new CritiqueKv(c.env.CRITIQUE_KV)

  if (!sessionId) {
    return c.html(<SuccessPage canceled={canceled} />)
  }

  const licenseKey = await kv.getCheckoutLicense(sessionId)
  if (!licenseKey) {
    return c.html(<SuccessPage canceled={canceled} />)
  }

  const record = await kv.getLicense(licenseKey)
  const status = record?.status || "inactive"
  return c.html(
    <SuccessPage
      licenseKey={record?.status === "active" ? licenseKey : undefined}
      status={status}
      canceled={canceled}
    />
  )
})

app.post("/stripe/webhook", async (c) => {
  const sig = c.req.header("Stripe-Signature")
  if (!sig) {
    return c.text("Missing Stripe signature", 400)
  }

  const body = await c.req.text()
  const secret = requireEnv(c.env.STRIPE_WEBHOOK_SECRET, "STRIPE_WEBHOOK_SECRET")
  const valid = await verifyStripeSignature(body, sig, secret)
  if (!valid) {
    return c.text("Invalid Stripe signature", 400)
  }

  const event = JSON.parse(body) as {
    type: string
    data: { object: any }
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as {
      id: string
      subscription?: string | null
      customer?: string | null
      customer_details?: { email?: string | null }
      customer_email?: string | null
    }

    const kv = new CritiqueKv(c.env.CRITIQUE_KV)
    const existingKey = await kv.getCheckoutLicense(session.id)
    if (!existingKey) {
      const licenseKey = generateLicenseKey()
      const record: LicenseRecord = {
        status: "active",
        subscriptionId: session.subscription || undefined,
        customerId: session.customer || undefined,
        createdAt: Date.now(),
      }
      await kv.setLicense(licenseKey, record)
      await kv.setCheckoutLicense(session.id, licenseKey)
      if (session.subscription) {
        await kv.setSubscriptionLicense(session.subscription, licenseKey)
      }

      const email = session.customer_details?.email || session.customer_email
      if (email) {
        try {
          await sendLicenseEmail(c.env, email, licenseKey)
        } catch (error) {
          logger.log("License email send failed", error)
        }
      } else {
        logger.log("License email skipped: missing customer email", {
          sessionId: session.id,
        })
      }
    }
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object as {
      id: string
      status?: string
    }
    const kv = new CritiqueKv(c.env.CRITIQUE_KV)
    const licenseKey = await kv.getSubscriptionLicense(subscription.id)
    if (licenseKey) {
      const record = (await kv.getLicense(licenseKey)) || {
        status: "inactive",
        createdAt: Date.now(),
      }
      const status = subscription.status === "active" || subscription.status === "trialing"
        ? "active"
        : "canceled"
      await kv.setLicense(licenseKey, {
        ...record,
        status,
        updatedAt: Date.now(),
      })
    }
  }

  return c.text("Received", 200)
})

// View HTML content with streaming
// GET /v/:id (short) or /view/:id (legacy)
// Query params: ?v=desktop or ?v=mobile to select version
// Server redirects mobile devices to ?v=mobile, client JS also handles redirect
async function handleView(c: any) {
  const id = c.req.param("id")

  const kv = new CritiqueKv(c.env.CRITIQUE_KV)

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
    html = await kv.getMobileHtml(id)
    if (!html) {
      html = await kv.getHtml(id)
    }
  } else {
    html = await kv.getHtml(id)
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

// Delete a diff by ID (requires owner secret)
// DELETE /v/:id with X-Critique-Owner-Secret header
app.delete("/v/:id", async (c) => {
  const id = c.req.param("id")
  const kv = new CritiqueKv(c.env.CRITIQUE_KV)

  if (!id || !/^[a-f0-9]{16,32}$/.test(id)) {
    return c.json({ error: "Invalid ID" }, 400)
  }

  const ownerSecret = c.req.header(OWNER_SECRET_HEADER)
  if (!ownerSecret) {
    return c.json({ error: "Missing owner secret header" }, 400)
  }

  // Check if diff exists
  const html = await kv.getHtml(id)
  if (!html) {
    return c.json({ error: "Not found" }, 404)
  }

  // Check if owner secret was stored
  const storedSecret = await kv.getOwnerSecret(id)
  if (!storedSecret) {
    return c.json({ error: "Cannot delete - no owner recorded for this diff" }, 403)
  }

  // Verify owner secret (timing-safe comparison)
  if (!timingSafeEqual(ownerSecret, storedSecret)) {
    return c.json({ error: "Unauthorized - invalid owner secret" }, 403)
  }

  // Delete all related KV keys
  await kv.deleteAll(id)

  return c.json({ success: true, message: "Deleted" })
})

// Serve OG image
// GET /og/:id.png
app.get("/og/:id.png", async (c) => {
  const idWithExt = c.req.param("id.png")
  const id = idWithExt?.replace(".png", "")

  const kv = new CritiqueKv(c.env.CRITIQUE_KV)

  if (!id || !/^[a-f0-9]{16,32}$/.test(id)) {
    return c.text("Invalid ID", 400)
  }

  const imageData = await kv.getOgImage(id)

  if (!imageData) {
    return c.text("Not found", 404)
  }

  return c.body(imageData, 200, {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=604800", // 7 days
  })
})

// Get raw HTML content (for debugging/API access)
// GET /raw/:id
app.get("/raw/:id", async (c) => {
  const id = c.req.param("id")

  const kv = new CritiqueKv(c.env.CRITIQUE_KV)

  if (!id || !/^[a-f0-9]{16,32}$/.test(id)) {
    return c.json({ error: "Invalid ID" }, 400)
  }

  const html = await kv.getHtml(id)

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

  const kv = new CritiqueKv(c.env.CRITIQUE_KV)

  if (!id || !/^[a-f0-9]{16,32}$/.test(id)) {
    return c.body(null, 400)
  }

  const html = await kv.getHtml(id)

  if (!html) {
    return c.body(null, 404)
  }

  c.header("Content-Length", String(html.length))
  return c.body(null, 200)
}

app.on("HEAD", "/v/:id", handleHead)
app.on("HEAD", "/view/:id", handleHead)

export default app
