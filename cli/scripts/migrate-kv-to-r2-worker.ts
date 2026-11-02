// Temporary worker used by migrate-kv-to-r2.ts. The script deploys it, calls it, then deletes it.
// It runs next to KV and R2, so the 14 GB of diffs never go through your machine
// and the Cloudflare REST API rate limit does not apply.
//
// GET  /list?cursor=   one page of KV keys (name + expiration)
// POST /migrate        { keys, dryRun, deleteKv } → per-key result
//
// KV keys without expiration go to keep/, keys with expiration go to ttl/.
// Objects already in R2 are skipped, so the migration can run again.

import type { KVNamespace, KVNamespaceListKey, R2Bucket } from "@cloudflare/workers-types"
import { diffBlobKey, gunzipBytes, gzipBytes, type DiffBlobKind, type DiffTier } from "../src/diff-store.ts"
import { DIFF_ID_REGEX } from "../src/diff-password.tsx"

type Env = { KV: KVNamespace; BUCKET: R2Bucket; MIGRATION_TOKEN: string }
type KvValueMetadata = { contentEncoding?: "gzip" } | null

export type MigrationKey = { name: string; expiration?: number }
export type MigrationResult = {
  name: string
  status: "record" | "exists" | "would-copy" | "copied" | "missing" | "failed"
  r2Key?: string
  kvBytes?: number
  r2Bytes?: number
  deletedKv?: boolean
  error?: string
}

const LIST_PAGE_SIZE = 1000
const CONCURRENCY = 6

/** Maps an old KV key name to the diff blob it holds, or null for small records (license:, owner:, ...). */
export function parseKvKey(name: string): { id: string; kind: DiffBlobKind } | null {
  const og = name.match(/^og-(.+)$/)
  const suffixed = name.match(/^(.+)-(mobile|patch)$/)
  const [id, kind]: [string | undefined, DiffBlobKind] = og
    ? [og[1], "og"]
    : suffixed
      ? [suffixed[1], suffixed[2] as "mobile" | "patch"]
      : [name, "html"]
  if (!id || !DIFF_ID_REGEX.test(id)) return null
  return { id, kind }
}

/** KV text was gzipped (with metadata) or raw (legacy, no metadata). R2 stores text gzipped and PNGs raw. */
async function toR2Bytes({ value, metadata, kind }: { value: ArrayBuffer; metadata: KvValueMetadata; kind: DiffBlobKind }) {
  const isGzip = metadata?.contentEncoding === "gzip"
  if (kind === "og") return isGzip ? gunzipBytes(value) : value
  return isGzip ? value : gzipBytes(value)
}

async function migrateKey(env: Env, key: MigrationKey, options: { dryRun: boolean; deleteKv: boolean }): Promise<MigrationResult> {
  const blob = parseKvKey(key.name)
  if (!blob) return { name: key.name, status: "record" }
  const tier: DiffTier = key.expiration ? "ttl" : "keep"
  const r2Key = diffBlobKey({ tier, ...blob })

  let result: MigrationResult
  if (await env.BUCKET.head(r2Key)) {
    result = { name: key.name, status: "exists", r2Key }
  } else if (options.dryRun) {
    return { name: key.name, status: "would-copy", r2Key }
  } else {
    const { value, metadata } = await env.KV.getWithMetadata<KvValueMetadata>(key.name, "arrayBuffer")
    // Expired or deleted after the list call
    if (!value) return { name: key.name, status: "missing", r2Key }
    const bytes = await toR2Bytes({ value, metadata, kind: blob.kind })
    await env.BUCKET.put(r2Key, bytes)
    result = { name: key.name, status: "copied", r2Key, kvBytes: value.byteLength, r2Bytes: bytes.byteLength }
  }

  if (options.deleteKv && !options.dryRun) {
    await env.KV.delete(key.name)
    result.deletedKv = true
  }
  return result
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get("Authorization") !== `Bearer ${env.MIGRATION_TOKEN}`) {
      return new Response("Unauthorized", { status: 401 })
    }
    const url = new URL(request.url)

    if (url.pathname === "/list") {
      const page = await env.KV.list({ cursor: url.searchParams.get("cursor") || undefined, limit: LIST_PAGE_SIZE })
      const keys: MigrationKey[] = page.keys.map((key: KVNamespaceListKey<unknown>) => ({ name: key.name, expiration: key.expiration }))
      return Response.json({ keys, cursor: page.list_complete ? null : page.cursor })
    }

    if (url.pathname === "/migrate" && request.method === "POST") {
      const { keys, dryRun, deleteKv } = (await request.json()) as { keys: MigrationKey[]; dryRun: boolean; deleteKv: boolean }
      const results: MigrationResult[] = []
      const queue = [...keys]
      await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
        for (let key = queue.shift(); key; key = queue.shift()) {
          results.push(await migrateKey(env, key, { dryRun, deleteKv }).catch((error): MigrationResult => ({
            name: key.name,
            status: "failed",
            error: String(error),
          })))
        }
      }))
      return Response.json({ results })
    }

    return new Response("Not found", { status: 404 })
  },
}
