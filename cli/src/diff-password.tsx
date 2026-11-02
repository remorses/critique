/** @jsxImportSource hono/jsx */
// Password protection for uploaded diffs.
// Protected diffs get a "p" + random hex ID and a PBKDF2 hash at password:{id} in KV.
// The ID prefix decides protection, so a missing hash (expired, deleted, KV lag) fails closed. A viewer types the password once;
// every password that worked is kept in the cw_pw cookie and all of them are tried on
// later requests, so one password unlocks every diff shared with it.
// Scripts can send the password in the X-Critique-Password header instead.

import type { Context } from "hono"
import { getCookie, setCookie } from "hono/cookie"
import type { KVNamespace } from "@cloudflare/workers-types"

type PasswordRecord = { salt: string; hash: string; iterations: number }
type KvEnv = { Bindings: { CRITIQUE_KV: KVNamespace } }

export type DiffAccess =
  | { protected: false; allowed: true }
  | { protected: true; allowed: true; password: string }
  | { protected: true; allowed: false }

export const PASSWORD_HEADER = "X-Critique-Password"
export const MAX_PASSWORD_LENGTH = 256
const COOKIE_NAME = "cw_pw"
// Browsers cap cookie lifetime at 400 days; it is refreshed on every unlocked view
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400
const MAX_COOKIE_PASSWORDS = 10
const MAX_COOKIE_VALUE_LENGTH = 3500
// Workers rejects PBKDF2 above 100k iterations
const PBKDF2_ITERATIONS = 100_000

/** Matches public content-hash IDs and "p"-prefixed protected IDs. */
export const DIFF_ID_REGEX = /^p?[a-f0-9]{16,32}$/

export function isProtectedId(id: string): boolean {
  return id.startsWith("p")
}

export function generateProtectedId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return `p${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`
}

export function passwordKvKey(id: string): string {
  return `password:${id}`
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function derivePasswordHash({
  password,
  salt,
  iterations,
}: {
  password: string
  salt: Uint8Array<ArrayBuffer>
  iterations: number
}): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256)
  return bytesToBase64(new Uint8Array(bits))
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

async function verifyPassword(record: PasswordRecord, password: string): Promise<boolean> {
  const salt = Uint8Array.from(atob(record.salt), (char) => char.charCodeAt(0))
  const hash = await derivePasswordHash({ password, salt, iterations: record.iterations })
  return constantTimeEqual(hash, record.hash)
}

export function isValidPassword(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_PASSWORD_LENGTH
}

export async function setDiffPassword({
  kv,
  id,
  password,
  ttlSeconds,
}: {
  kv: KVNamespace
  id: string
  password: string
  ttlSeconds?: number
}): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const record: PasswordRecord = {
    salt: bytesToBase64(salt),
    hash: await derivePasswordHash({ password, salt, iterations: PBKDF2_ITERATIONS }),
    iterations: PBKDF2_ITERATIONS,
  }
  await kv.put(passwordKvKey(id), JSON.stringify(record), ttlSeconds ? { expirationTtl: ttlSeconds } : undefined)
}

function readCookiePasswords(c: Context): string[] {
  const raw = getCookie(c, COOKIE_NAME)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isValidPassword) : []
  } catch {
    return []
  }
}

function getPasswordRecord(kv: KVNamespace, id: string): Promise<PasswordRecord | null> {
  return kv.get<PasswordRecord>(passwordKvKey(id), "json")
}

// Checks one typed password, ignoring the ones saved in the cookie.
export async function checkTypedPassword<E extends KvEnv>(
  c: Context<E>,
  { id, password }: { id: string; password: string },
): Promise<"unprotected" | "correct" | "wrong"> {
  if (!isProtectedId(id)) return "unprotected"
  c.header("Cache-Control", "private, no-store")
  const record = await getPasswordRecord(c.env.CRITIQUE_KV, id)
  return record && (await verifyPassword(record, password)) ? "correct" : "wrong"
}

// Tries the header password first, then every password saved in the cookie.
// Also marks the response private, so protected content never sits in a shared cache.
export async function checkDiffAccess<E extends KvEnv>(c: Context<E>, id: string): Promise<DiffAccess> {
  if (!isProtectedId(id)) return { protected: false, allowed: true }
  c.header("Cache-Control", "private, no-store")
  const record = await getPasswordRecord(c.env.CRITIQUE_KV, id)
  if (!record) return { protected: true, allowed: false }

  const header = c.req.header(PASSWORD_HEADER)
  const candidates = isValidPassword(header) ? [header, ...readCookiePasswords(c)] : readCookiePasswords(c)
  for (const password of new Set(candidates)) {
    if (await verifyPassword(record, password)) return { protected: true, allowed: true, password }
  }
  return { protected: true, allowed: false }
}

// Saves the password at the front of the cookie list, dropping the oldest ones if it gets too big.
export function rememberPassword(c: Context, password: string): void {
  const passwords = [password, ...readCookiePasswords(c).filter((p) => p !== password)].slice(0, MAX_COOKIE_PASSWORDS)
  while (passwords.length > 1 && encodeURIComponent(JSON.stringify(passwords)).length > MAX_COOKIE_VALUE_LENGTH) {
    passwords.pop()
  }
  setCookie(c, COOKIE_NAME, JSON.stringify(passwords), {
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  })
}

export function renderLockPage(c: Context, options: { id: string; error?: string }) {
  const search = new URL(c.req.url).search
  c.header("Cache-Control", "private, no-store")
  return c.html(
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>Password required · critique</title>
        <link rel="icon" href="/favicon-light.png" media="(prefers-color-scheme: light)" />
        <link rel="icon" href="/favicon-dark.png" media="(prefers-color-scheme: dark)" />
        <style>{LOCK_PAGE_CSS}</style>
      </head>
      <body>
        <form method="post" action={`/v/${options.id}/unlock${search}`}>
          <h1>This diff is password protected</h1>
          <input
            type="password"
            name="password"
            placeholder="Password"
            autocomplete="current-password"
            maxlength={MAX_PASSWORD_LENGTH}
            required
            autofocus
          />
          {options.error ? <p class="error">{options.error}</p> : null}
          <button type="submit">Unlock</button>
        </form>
      </body>
    </html>,
    401,
  )
}

const LOCK_PAGE_CSS = `
  :root { color-scheme: light dark; --bg: #ffffff; --fg: #1f2328; --muted: #d0d7de; --accent: #1f2328; --accent-fg: #ffffff; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0d1117; --fg: #e6edf3; --muted: #30363d; --accent: #e6edf3; --accent-fg: #0d1117; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg); color: var(--fg); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  form { width: min(360px, calc(100vw - 32px)); display: flex; flex-direction: column; gap: 12px; }
  h1 { font-size: 15px; font-weight: 600; margin: 0 0 4px; }
  input, button { font: inherit; font-size: 14px; padding: 10px 12px; border-radius: 6px; }
  input { border: 1px solid var(--muted); background: transparent; color: var(--fg); outline: none; }
  input:focus { border-color: var(--fg); }
  button { border: none; background: var(--accent); color: var(--accent-fg); cursor: pointer; }
  .error { margin: 0; font-size: 13px; color: #cf222e; }
  @media (prefers-color-scheme: dark) { .error { color: #ff7b72; } }
`
