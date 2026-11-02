// Diff blob storage for the critique.work worker: R2 bucket behind the Cache API.
//
// R2 layout: {tier}/{id}/{file}
//   ttl/   free uploads, deleted by an R2 lifecycle rule 7 days after upload
//   keep/  uploads made with an active license, never expire
//
// Reads: caches.default (this datacenter) → R2 (both tiers in parallel) → cache.put.
// Writes go to R2 and to the cache, so the first view after an upload is a cache hit.
// Text blobs are stored gzipped; the OG PNG is stored as is.
// Cache API delete only clears the current datacenter, so a deleted diff can stay
// cached elsewhere for CACHE_MAX_AGE (browsers already cache views for that long).

import type { R2Bucket } from "@cloudflare/workers-types"

// Workers-only global. The CLI tsconfig uses bun types, which have no caches.default.
declare const caches: {
  default: {
    match(key: Request): Promise<Response | undefined>
    put(key: Request, value: Response): Promise<void>
    delete(key: Request): Promise<boolean>
  }
}

export const DIFF_BLOBS = {
  html: { file: "desktop.html.gz", gzip: true },
  mobile: { file: "mobile.html.gz", gzip: true },
  patch: { file: "diff.patch.gz", gzip: true },
  og: { file: "og.png", gzip: false },
} as const

export type DiffBlobKind = keyof typeof DIFF_BLOBS
export type DiffTier = "ttl" | "keep"

const TIERS: DiffTier[] = ["keep", "ttl"]
const KINDS: DiffBlobKind[] = ["html", "mobile", "patch", "og"]
const CACHE_MAX_AGE = 60 * 60 * 24

export function diffBlobKey({ tier, id, kind }: { tier: DiffTier; id: string; kind: DiffBlobKind }): string {
  return `${tier}/${id}/${DIFF_BLOBS[kind].file}`
}

export async function gzipBytes(bytes: ArrayBuffer | Uint8Array): Promise<ArrayBuffer> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))
  return new Response(stream).arrayBuffer()
}

export async function gunzipBytes(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))
  return new Response(stream).arrayBuffer()
}

export class DiffStore {
  private bucket: R2Bucket
  private origin: string
  private waitUntil: (promise: Promise<void>) => void

  constructor(options: { bucket: R2Bucket; origin: string; waitUntil: (promise: Promise<void>) => void }) {
    this.bucket = options.bucket
    this.origin = options.origin
    this.waitUntil = options.waitUntil

    this.cacheKey = this.cacheKey.bind(this)
    this.cachePut = this.cachePut.bind(this)
    this.getStored = this.getStored.bind(this)
    this.put = this.put.bind(this)
    this.putText = this.putText.bind(this)
    this.getBytes = this.getBytes.bind(this)
    this.getText = this.getText.bind(this)
    this.deleteAll = this.deleteAll.bind(this)
  }

  private cacheKey(id: string, kind: DiffBlobKind): Request {
    return new Request(`${this.origin}/_cache/diffs/${id}/${DIFF_BLOBS[kind].file}`)
  }

  private cachePut({ id, kind, stored }: { id: string; kind: DiffBlobKind; stored: ArrayBuffer }): void {
    const response = new Response(stored, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": `public, max-age=${CACHE_MAX_AGE}`,
      },
    })
    this.waitUntil(caches.default.put(this.cacheKey(id, kind), response))
  }

  /** Stored bytes (gzipped for text kinds), from the cache or R2. */
  private async getStored(id: string, kind: DiffBlobKind): Promise<ArrayBuffer | null> {
    const cached = await caches.default.match(this.cacheKey(id, kind))
    if (cached) return cached.arrayBuffer()

    const objects = await Promise.all(TIERS.map((tier) => this.bucket.get(diffBlobKey({ tier, id, kind }))))
    const [found, ...unused] = objects.filter((object) => object !== null)
    for (const object of unused) await object.body.cancel()
    if (!found) return null

    const stored = await found.arrayBuffer()
    this.cachePut({ id, kind, stored })
    return stored
  }

  async put({ id, kind, bytes, permanent }: { id: string; kind: DiffBlobKind; bytes: ArrayBuffer; permanent: boolean }) {
    const stored = DIFF_BLOBS[kind].gzip ? await gzipBytes(bytes) : bytes
    // Reads prefer keep/, so a blob that already lives there must be updated there
    const tier: DiffTier = permanent || (await this.bucket.head(diffBlobKey({ tier: "keep", id, kind }))) ? "keep" : "ttl"
    await this.bucket.put(diffBlobKey({ tier, id, kind }), stored)
    this.cachePut({ id, kind, stored })
  }

  async putText({ id, kind, text, permanent }: { id: string; kind: DiffBlobKind; text: string; permanent: boolean }) {
    await this.put({ id, kind, bytes: new TextEncoder().encode(text).buffer, permanent })
  }

  async getBytes(id: string, kind: DiffBlobKind): Promise<ArrayBuffer | null> {
    const stored = await this.getStored(id, kind)
    if (!stored) return null
    return DIFF_BLOBS[kind].gzip ? gunzipBytes(stored) : stored
  }

  async getText(id: string, kind: DiffBlobKind): Promise<string | null> {
    const bytes = await this.getBytes(id, kind)
    return bytes ? new TextDecoder().decode(bytes) : null
  }

  async deleteAll(id: string): Promise<void> {
    await this.bucket.delete(TIERS.flatMap((tier) => KINDS.map((kind) => diffBlobKey({ tier, id, kind }))))
    await Promise.all(KINDS.map((kind) => caches.default.delete(this.cacheKey(id, kind))))
  }
}
