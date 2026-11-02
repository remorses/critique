// End-to-end encryption for password protected diffs.
//
// The CLI gzips each blob (desktop HTML, mobile HTML, patch), then encrypts it with
// AES-256-GCM. The key is PBKDF2-SHA256(password, salt); one salt per diff, one IV per blob.
// The worker stores only these envelopes and never sees the password.
//   browser: the lock page decrypts with DECRYPT_JS
//   curl:    sends the derived per-diff key in the critique_key cookie; the worker decrypts
//            for that request only. The key opens this diff, not other diffs with the same password.
//
// Envelope (one per blob, self-contained):
//   0   4   magic "CQE1" (format version)
//   4   4   PBKDF2 iterations, uint32 big-endian
//   8   16  salt
//   24  12  AES-GCM IV
//   36  n   ciphertext + 16-byte tag        plaintext = gzip(utf-8 text)
// AAD = header (bytes 0..35) + kind, so nobody can edit the header or swap html and patch.
//
// Gzip runs before encryption: ciphertext does not compress, so gzip after it saves nothing.
// CRIME/BREACH-style size attacks need attacker text mixed with the secret and many size
// observations; the CLI encrypts once with no attacker input, so there is no size oracle.

import { gunzipBytes, gzipBytes } from "./diff-store.js"

export const ENCRYPTED_KINDS = ["html", "mobile", "patch"] as const
export type EncryptedKind = (typeof ENCRYPTED_KINDS)[number]

export const KEY_COOKIE = "critique_key"
const MAGIC = "CQE1"
// OWASP 2023 value for PBKDF2-SHA256. Stored per blob, so it can be raised later.
const PBKDF2_ITERATIONS = 600_000
const SALT_BYTES = 16
const IV_BYTES = 12
const HEADER_BYTES = MAGIC.length + 4 + SALT_BYTES + IV_BYTES
const KEY_BYTES = 32

export function isEncryptedKind(value: string): value is EncryptedKind {
  return ENCRYPTED_KINDS.some((kind) => kind === value)
}

function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}

function additionalData(header: Uint8Array, kind: EncryptedKind): Uint8Array<ArrayBuffer> {
  return concatBytes(header, new TextEncoder().encode(kind))
}

/** True when the bytes start with the envelope magic and are long enough to hold a tag. */
export function isEnvelope(bytes: Uint8Array): boolean {
  return bytes.length > HEADER_BYTES && new TextDecoder().decode(bytes.subarray(0, MAGIC.length)) === MAGIC
}

/**
 * Encrypts every blob with one key derived from the password.
 * Returns the envelopes and the per-diff key (base64url) for the curl cookie.
 */
export async function encryptDiffBlobs({
  password,
  blobs,
}: {
  password: string
  blobs: Partial<Record<EncryptedKind, string>>
}): Promise<{ envelopes: Partial<Record<EncryptedKind, Uint8Array>>; key: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"])
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"],
  )

  const iterations = new Uint8Array(4)
  new DataView(iterations.buffer).setUint32(0, PBKDF2_ITERATIONS)
  const prefix = concatBytes(new TextEncoder().encode(MAGIC), iterations, salt)

  const envelopes: Partial<Record<EncryptedKind, Uint8Array>> = {}
  for (const kind of ENCRYPTED_KINDS) {
    const text = blobs[kind]
    if (text === undefined) continue
    const header = concatBytes(prefix, crypto.getRandomValues(new Uint8Array(IV_BYTES)))
    const compressed = await gzipBytes(new TextEncoder().encode(text))
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: header.subarray(prefix.length), additionalData: additionalData(header, kind) },
      key,
      compressed,
    )
    envelopes[kind] = concatBytes(header, new Uint8Array(ciphertext))
  }

  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key))
  return { envelopes, key: toBase64Url(rawKey) }
}

/** Imports the base64url per-diff key from the curl cookie. Null when malformed. */
export async function importDiffKey(value: string): Promise<CryptoKey | null> {
  const raw = fromBase64Url(value)
  if (!raw || raw.length !== KEY_BYTES) return null
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"])
}

/** Decrypts one envelope with the per-diff key. Null when the key is wrong or the blob was changed. */
export async function decryptDiffBlob({
  key,
  kind,
  envelope,
}: {
  key: CryptoKey
  kind: EncryptedKind
  envelope: Uint8Array
}): Promise<string | null> {
  if (!isEnvelope(envelope)) return null
  const header = envelope.slice(0, HEADER_BYTES)
  const compressed = await crypto.subtle
    .decrypt(
      { name: "AES-GCM", iv: header.subarray(HEADER_BYTES - IV_BYTES), additionalData: additionalData(header, kind) },
      key,
      envelope.slice(HEADER_BYTES),
    )
    .catch(() => null)
  if (!compressed) return null
  return new TextDecoder().decode(await gunzipBytes(compressed))
}

// Browser copy of the decrypt path, inlined in the lock page (diff-password.tsx).
// Takes a non-extractable PBKDF2 base key, so the page never keeps the password itself.
// diff-crypto.test.ts runs it against encryptDiffBlobs output so the two copies cannot drift.
export const DECRYPT_JS = `
  async function critiqueImportPassword(password) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  }

  // Returns the decrypted text, or null when the password is wrong or the blob is not an envelope.
  async function critiqueDecrypt({ baseKey, kind, envelope }) {
    const HEADER_BYTES = ${HEADER_BYTES}
    const IV_BYTES = ${IV_BYTES}
    if (envelope.length <= HEADER_BYTES) return null
    if (new TextDecoder().decode(envelope.subarray(0, ${MAGIC.length})) !== '${MAGIC}') return null
    const header = envelope.slice(0, HEADER_BYTES)
    const iterations = new DataView(header.buffer).getUint32(${MAGIC.length})
    const salt = header.slice(${MAGIC.length + 4}, HEADER_BYTES - IV_BYTES)
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    )
    const kindBytes = new TextEncoder().encode(kind)
    const additionalData = new Uint8Array(HEADER_BYTES + kindBytes.length)
    additionalData.set(header)
    additionalData.set(kindBytes, HEADER_BYTES)
    const compressed = await crypto.subtle
      .decrypt({ name: 'AES-GCM', iv: header.slice(HEADER_BYTES - IV_BYTES), additionalData }, key, envelope.slice(HEADER_BYTES))
      .catch(() => null)
    if (!compressed) return null
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))
    return new Response(stream).text()
  }
`
