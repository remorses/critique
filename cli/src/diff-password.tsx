/** @jsxImportSource hono/jsx */
// Lock page for end-to-end encrypted diffs (see diff-crypto.ts for the format).
// Encrypted diffs get a "p" + random hex ID. The worker serves this page for them; the page
// fetches the ciphertext from /v/:id/blob/:kind and decrypts it in the browser.
// Passwords that worked are remembered as non-extractable PBKDF2 keys in IndexedDB, newest
// first, so one password unlocks every diff shared with it and no script can read it back.

import type { Context } from "hono"
import { DECRYPT_JS } from "./diff-crypto.js"

/** Matches public content-hash IDs and "p"-prefixed encrypted IDs. */
export const DIFF_ID_REGEX = /^p?[a-f0-9]{16,32}$/

export function isProtectedId(id: string): boolean {
  return id.startsWith("p")
}

export function generateProtectedId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return `p${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`
}

export function renderLockPage(c: Context) {
  // No secrets in the page, but it must pick up new lock page code right after a deploy
  c.header("Cache-Control", "no-cache")
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
        <form hidden>
          <h1>This diff is password protected</h1>
          <input
            type="password"
            name="password"
            placeholder="Password"
            autocomplete="current-password"
            required
          />
          <p class="error" hidden />
          <button type="submit">Unlock</button>
          <p class="note">End-to-end encrypted. The password never leaves this browser.</p>
        </form>
        <p class="status">Decrypting…</p>
        <noscript>This diff is end-to-end encrypted. Enable JavaScript to decrypt it.</noscript>
        <script dangerouslySetInnerHTML={{ __html: `${DECRYPT_JS}\n${LOCK_PAGE_JS}` }} />
      </body>
    </html>,
  )
}

const LOCK_PAGE_JS = `
(async function () {
  const DB_NAME = 'critique'
  const STORE = 'passwords'
  const RECORD = 'keys'
  const MAX_KEYS = 10

  const form = document.querySelector('form')
  const input = form.querySelector('input')
  const button = form.querySelector('button')
  const error = form.querySelector('.error')
  const status = document.querySelector('.status')

  function showStatus(message) {
    status.textContent = message
    status.hidden = false
    form.hidden = true
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  // Remembered keys are optional: private windows can block IndexedDB
  async function loadKeys() {
    try {
      const db = await openDb()
      return await new Promise((resolve, reject) => {
        const request = db.transaction(STORE).objectStore(STORE).get(RECORD)
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : [])
        request.onerror = () => reject(request.error)
      })
    } catch {
      return []
    }
  }

  async function saveKeys(keys) {
    try {
      const db = await openDb()
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, 'readwrite')
        transaction.objectStore(STORE).put(keys.slice(0, MAX_KEYS), RECORD)
        transaction.oncomplete = resolve
        transaction.onerror = () => reject(transaction.error)
      })
    } catch {}
  }

  function show(html) {
    document.open()
    document.write(html)
    document.close()
  }

  const id = location.pathname.split('/').pop()
  async function fetchBlob(kind) {
    const response = await fetch('/v/' + id + '/blob/' + kind)
    if (response.status === 404) return null
    if (!response.ok) throw new Error('HTTP ' + response.status)
    return { kind, envelope: new Uint8Array(await response.arrayBuffer()) }
  }

  let blob
  try {
    // Mobile falls back to desktop when no mobile version was uploaded
    const mobile = new URLSearchParams(location.search).get('v') === 'mobile'
    blob = (mobile && (await fetchBlob('mobile'))) || (await fetchBlob('html'))
  } catch {
    showStatus('Could not load this diff. Reload to try again.')
    return
  }
  if (!blob) {
    showStatus('This link is no longer available.')
    return
  }

  // Newest first; the key that works moves to the front
  const keys = await loadKeys()
  for (const [index, baseKey] of keys.entries()) {
    const html = await critiqueDecrypt({ baseKey, kind: blob.kind, envelope: blob.envelope })
    if (html === null) continue
    await saveKeys([baseKey, ...keys.filter((_, other) => other !== index)])
    show(html)
    return
  }

  status.hidden = true
  form.hidden = false
  input.focus()
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    button.disabled = true
    error.hidden = true
    const baseKey = await critiqueImportPassword(input.value)
    const html = await critiqueDecrypt({ baseKey, kind: blob.kind, envelope: blob.envelope })
    if (html === null) {
      error.textContent = 'Wrong password'
      error.hidden = false
      button.disabled = false
      input.select()
      return
    }
    // Every remembered key already failed here, so this one is new
    await saveKeys([baseKey, ...keys])
    show(html)
  })
})()
`

const LOCK_PAGE_CSS = `
  :root { color-scheme: light dark; --bg: #ffffff; --fg: #1f2328; --muted: #d0d7de; --accent: #1f2328; --accent-fg: #ffffff; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0d1117; --fg: #e6edf3; --muted: #30363d; --accent: #e6edf3; --accent-fg: #0d1117; }
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg); color: var(--fg); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  form { width: min(360px, calc(100vw - 32px)); display: flex; flex-direction: column; gap: 12px; }
  h1 { font-size: 15px; font-weight: 600; margin: 0 0 4px; }
  input, button { font: inherit; font-size: 14px; padding: 10px 12px; border-radius: 6px; }
  input { border: 1px solid var(--muted); background: transparent; color: var(--fg); outline: none; }
  input:focus { border-color: var(--fg); }
  button { border: none; background: var(--accent); color: var(--accent-fg); cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: progress; }
  .error { margin: 0; font-size: 13px; color: #cf222e; }
  .note, .status, noscript { margin: 0; font-size: 12px; opacity: 0.7; }
  @media (prefers-color-scheme: dark) { .error { color: #ff7b72; } }
`
