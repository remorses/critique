---
title: End-to-end encryption for password diffs
description: Plan to encrypt password protected critique.work diffs in the CLI so the worker only stores ciphertext.
---

# End-to-end encryption for password diffs

When `--password` is set, the **CLI encrypts** desktop HTML, mobile HTML and patch before upload.
The worker stores ciphertext only and never sees the password. The browser decrypts.
Public diffs (no password) do not change.

```
 CLI (bun)                                 worker (critique.work)            browser
 ─────────                                 ──────────────────────            ───────
 render html, mobile, patch
   │
   ├─► gzip each blob
   ├─► PBKDF2(password, salt) ─► AES key
   ├─► AES-256-GCM each blob ──► POST /upload {encrypted:{...}} ──► R2 keep|ttl/{id}/*.enc
   │                                                                     │
   │                                  GET /v/{id} ◄──────────────────────┼──── lock page (no secrets)
   │                                  GET /v/{id}/blob/html ─────────────┴──► ciphertext
   │                                                                          decrypt + gunzip
   │                                                                          document.write(html)
   └─► prints curl -b critique_key=<key> ──► GET /v/{id}.patch ──► worker decrypts (agents)
```

## Decisions

### Cipher and key derivation

- **AES-256-GCM** through WebCrypto. It is native in Bun, Workers and every browser, so no dependency.
- **PBKDF2-SHA256, 600,000 iterations** (OWASP 2023 value). The 100k cap only applied in Workers;
  derivation now runs in the CLI and browser. Iterations are stored in the blob so we can raise them later.
- One random 16-byte **salt per diff**, shared by its three blobs, so the CLI and the browser derive once.
- One random 12-byte **IV per blob**. The key is unique per diff (unique salt), so random IVs are safe.
- Wrong password is detected by the GCM tag failing. No password hash is stored anywhere.

Argon2id would resist GPU guessing much better, but needs a WASM build in the CLI and the lock page.
Left as an open question.

### Data format (one self-contained envelope per blob)

```
offset  size  field
0       4     magic "CQE1" (format version lives in the magic)
4       4     PBKDF2 iterations, uint32 big-endian
8       16    salt
24      12    AES-GCM IV
36      n     ciphertext + 16-byte GCM tag      plaintext = gzip(utf-8 text)

AAD = bytes 0..35 (the header) + utf-8 kind ("html" | "mobile" | "patch")
```

- The header in AAD stops header tampering; the kind in AAD stops the server swapping html and patch.
- Self-contained blobs mean any blob can be decrypted with just the password, or with the per-diff key.
- The KV `password:{id}` record is gone. Encrypted diffs need nothing in KV except the owner secret.

### Compression order: gzip first, then encrypt

1. **Ciphertext does not compress.** Gzip after encryption saves 0 bytes, so the worker gzip step is wasted CPU.
2. **Smaller upload.** Diff HTML compresses about 5 to 10 times. This more than pays for the base64 overhead in the JSON body.
3. **Less data to encrypt and decrypt**, which matters on phones.
4. **CRIME/BREACH do not apply.** Those attacks need an attacker who mixes chosen text with the secret
   and watches many ciphertext sizes. The CLI encrypts once, with no attacker input, so there is no size oracle.
   The compressed size still leaks rough diff size, which the plaintext version also leaked.

So encrypted blobs are stored as is (`gzip: false`) and the browser decompresses with `DecompressionStream`.

### IDs and routes

- Encrypted diffs keep the random **`p` prefix**. A `p` ID now means "encrypted".
- `GET /v/:id` (p ID): small lock page, no secrets in it.
- `GET /v/:id/blob/:kind` (new): ciphertext as `application/octet-stream`.
  Encrypted bytes are safe in shared caches, so this gets `public, max-age=86400`.
- `GET /v/:id.patch` and `/raw/:id` (p ID): plaintext with a valid `critique_key` cookie, else a 401
  text with the curl command shape. Agents read that and know what to do.
- `POST /v/:id/unlock`, the `cw_pw` cookie and the `X-Critique-Password` header are removed.
- `POST /upload` with a plaintext `password` field (critique 0.4.0) returns 400 "Update critique to upload password protected diffs".
  Accepting it would quietly keep server-readable "protected" diffs.

### Lock page in the browser

1. Pick blob: `?v=mobile` → `mobile` (fall back to `html` on 404), else `html`. The server mobile redirect stays.
2. Try remembered keys most recent first, then show the password form.
3. On success: decrypt, gunzip, `document.open(); document.write(html); document.close()`.
   This keeps the URL, `#file` anchors, click-to-copy and the title working, which an iframe would break.
4. Remember the password for later diffs (max 10, most recent first).

**Remember as non-extractable PBKDF2 keys in IndexedDB, not plaintext passwords in localStorage.**
`importKey("raw", password, "PBKDF2", false)` gives a `CryptoKey` that can derive new keys but JS can never read
the password back. This matters because anyone can upload HTML with scripts to critique.work (public `/upload`
takes any `html`). A malicious diff on the same origin could read localStorage passwords; it cannot read a
non-extractable key. Costs about 30 lines of IndexedDB code.

The browser decrypt code is a JS string (`DECRYPT_JS`, same pattern as `SECTION_ANCHOR_JS`) because the lock
page is inline HTML. A test runs that string against CLI output so the two copies cannot drift.

### Agents: curl with a key cookie (decided instead of a `critique decrypt` command)

```bash
curl -b 'critique_key=<base64url AES key>' 'https://critique.work/v/<id>.patch'
```

The CLI prints this after upload (and `curl` in `--json`). The cookie holds the derived per-diff AES key,
not the password, so it opens only this diff and the worker needs no PBKDF2 (Workers caps it at 100k).
The worker decrypts that one response and stores nothing. Without a patch (review uploads) it points to `/raw/:id`.

### Existing password diffs

Production has **5** `password:` records today (3 permanent, 2 expiring). The server only has PBKDF2 hashes,
not passwords, so it cannot encrypt them. Plan: drop them. After deploy a legacy `p` ID shows the lock page,
whose blob request 404s, so it says "This link is no longer available".
Then delete their KV records and R2 blobs once with wrangler. Keeping a legacy server-gated path for 5 diffs
would keep all the cookie and hash code alive.

## Files to change

| File | Change |
| --- | --- |
| `cli/src/diff-crypto.ts` (new) | `encryptDiffBlobs({ password, blobs })`, `decryptDiffBlob({ password, kind, bytes })`, envelope encode/parse, `DECRYPT_JS` browser string. WebCrypto + CompressionStream only, so CLI and worker can both import it. |
| `cli/src/diff-crypto.test.ts` (new) | One round trip test: CLI encrypt → `DECRYPT_JS` via `new Function` → same text. Wrong password and swapped kind fail. |
| `cli/src/diff-password.tsx` | Delete PBKDF2 hashing, cookie, header, `checkDiffAccess`, `checkTypedPassword`, `setDiffPassword`, `passwordKvKey`. Keep ID helpers. Lock page becomes a client-side form with `DECRYPT_JS` and the IndexedDB key store. |
| `cli/src/diff-store.ts` | Add kinds `encHtml`, `encMobile`, `encPatch` (`*.enc`, `gzip: false`) so stored names match content and `deleteAll` covers them. |
| `cli/src/worker.tsx` | `/upload` encrypted branch (base64 decode, check magic, store, no OG, no KV password). New blob route. `.patch`, `/raw`, HEAD hint for p IDs. Remove unlock route and `passwordKvKey` delete. Update header comments. |
| `cli/src/web-utils.tsx` | `uploadHtml` encrypts when `password` is set and sends `{ encrypted: { html, mobile, patch } }` base64. Never sends the password. |
| `cli/src/cli.tsx` | Print the curl command after upload and add `curl` to `--json`. |
| `cli/src/worker.preview-upload.e2e.test.ts` | Extend: encrypted upload, ciphertext fetch, curl cookie decrypt, `.patch` hint, 0.4.0 rejection. |
| `cli/src/routes/legal.tsx` | Remove password hash row and `cw_pw` cookie. Say the operator cannot read password diffs, and that the browser keeps remembered keys in IndexedDB. |
| `README.md`, `skills/critique/SKILL.md`, `AGENTS.md` | Document E2E, the curl key cookie, weak password risk. Remove `X-Critique-Password`. |
| `.changeset/*.md` | Breaking change note: old links gone, 0.4.0 must update, decrypt command. |

## Risks

- **Offline guessing.** Anyone who gets the ciphertext (us, Cloudflare, anyone with the link) can guess
  passwords offline. 600k PBKDF2 slows this, but `hunter2` falls in seconds.
- **Slow unlock on phones.** 600k iterations is about 0.2 s on a laptop and 1 to 2 s on a cheap phone, per try.
  Trying 10 remembered keys on a miss costs up to 10 times that.
- **Lost password means lost diff.** Nobody can recover it.
- Same-origin scripts in uploaded diffs are an existing risk (they can already fetch protected diffs with the
  cookie today). Fully fixing it needs a `Content-Security-Policy: sandbox` on public diffs or a separate origin.
  Out of scope here.

## Resolved (user said "proceed" with the recommendations)

1. Weak passwords: the CLI warns under 12 characters on stderr.
2. No key-in-link mode for now.
3. PBKDF2 600k now; Argon2id later if needed (iterations live in the envelope).
4. Drop the 5 existing 0.4.0 password diffs. After the production deploy, delete their `password:` and
   `owner:` KV keys and their R2 `*.gz` blobs.
5. IndexedDB non-extractable keys.
6. Agents use curl with the per-diff key cookie, not a `critique decrypt` command.
