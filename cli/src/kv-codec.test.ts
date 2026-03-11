// Tests for KV gzip codec helpers used by the Cloudflare worker.

import { describe, expect, test } from "bun:test"
import {
  buildKvPutOptions,
  decodeBinaryFromKv,
  decodeTextFromKv,
  gzipArrayBuffer,
  gzipText,
} from "./kv-codec.js"

describe("kv-codec", () => {
  test("round-trips gzip text payloads", async () => {
    const input = "<html><body>diff line +1 -0</body></html>\n".repeat(200)
    const compressed = await gzipText(input)

    const decoded = await decodeTextFromKv(compressed, {
      contentType: "text/html; charset=utf-8",
      contentEncoding: "gzip",
      schemaVersion: 1,
    })

    expect(decoded).toBe(input)
  })

  test("decodes legacy uncompressed text payloads", async () => {
    const input = "plain html without kv metadata"
    const bytes = new TextEncoder().encode(input)
    const decoded = await decodeTextFromKv(bytes.buffer, null)

    expect(decoded).toBe(input)
  })

  test("round-trips gzip binary payloads", async () => {
    const bytes = Uint8Array.from({ length: 1024 }, (_, index) => index % 256)
    const compressed = await gzipArrayBuffer(bytes.buffer)

    const decoded = await decodeBinaryFromKv(compressed, {
      contentType: "image/png",
      contentEncoding: "gzip",
      schemaVersion: 1,
    })

    expect(new Uint8Array(decoded)).toEqual(bytes)
  })

  test("returns undefined put options when empty", () => {
    expect(buildKvPutOptions()).toBeUndefined()
  })

  test("builds put options with ttl and metadata", () => {
    expect(
      buildKvPutOptions(3600, {
        contentType: "text/html; charset=utf-8",
        contentEncoding: "gzip",
        schemaVersion: 1,
      }),
    ).toEqual({
      expirationTtl: 3600,
      metadata: {
        contentType: "text/html; charset=utf-8",
        contentEncoding: "gzip",
        schemaVersion: 1,
      },
    })
  })
})
