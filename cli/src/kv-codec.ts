// KV value compression/decompression helpers for Cloudflare Worker storage.
// Provides metadata-aware gzip encoding and decoding for text and binary payloads.

export type KvValueMetadata = {
  contentType?: string
  contentEncoding?: "gzip"
  schemaVersion?: 1
}

export const KV_SCHEMA_VERSION = 1 as const

export function buildKvPutOptions(
  ttlSeconds?: number,
  metadata?: KvValueMetadata,
): { expirationTtl?: number; metadata?: KvValueMetadata } | undefined {
  if (ttlSeconds === undefined && metadata === undefined) {
    return undefined
  }

  return {
    ...(ttlSeconds !== undefined ? { expirationTtl: ttlSeconds } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  }
}

export async function gzipArrayBuffer(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const stream = new Blob([buffer]).stream().pipeThrough(new CompressionStream("gzip"))
  return await new Response(stream).arrayBuffer()
}

export async function gunzipArrayBuffer(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"))
  return await new Response(stream).arrayBuffer()
}

export async function gzipText(value: string): Promise<ArrayBuffer> {
  const bytes = new TextEncoder().encode(value)
  return gzipArrayBuffer(bytes.buffer)
}

export async function decodeTextFromKv(
  value: ArrayBuffer,
  metadata: KvValueMetadata | null,
): Promise<string> {
  const buffer = metadata?.contentEncoding === "gzip"
    ? await gunzipArrayBuffer(value)
    : value
  return new TextDecoder().decode(buffer)
}

export async function decodeBinaryFromKv(
  value: ArrayBuffer,
  metadata: KvValueMetadata | null,
): Promise<ArrayBuffer> {
  if (metadata?.contentEncoding === "gzip") {
    return await gunzipArrayBuffer(value)
  }
  return value
}
