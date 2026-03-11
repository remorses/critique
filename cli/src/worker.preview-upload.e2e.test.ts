// End-to-end preview worker smoke test for upload/read/delete endpoints.
// Validates HTML + mobile upload, OG image round-trip, and owner-secret deletion.

import { describe, expect, test } from "bun:test"
import crypto from "crypto"

const BASE_URL = process.env.CRITIQUE_PREVIEW_URL || "https://preview.critique.work"
const OWNER_SECRET_HEADER = "X-Critique-Owner-Secret"
const SAMPLE_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HwAFgwJ/lYxR5QAAAABJRU5ErkJggg=="

function randomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString("hex")
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function getString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key]
  if (typeof value !== "string") {
    throw new Error(`${label}.${key} must be a string`)
  }
  return value
}

describe("preview worker upload and reads", () => {
  test("uploads HTML+OG and serves desktop/mobile/raw/og correctly", async () => {
    const ownerSecret = `preview-owner-${randomHex(8)}`
    const desktopMarker = `desktop-${randomHex(6)}`
    const mobileMarker = `mobile-${randomHex(6)}`
    const inputOgBytes = Buffer.from(SAMPLE_PNG_BASE64, "base64")

    let uploadedId: string | null = null

    try {
      const uploadResponse = await fetch(`${BASE_URL}/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [OWNER_SECRET_HEADER]: ownerSecret,
        },
        body: JSON.stringify({
          html: `<html><head><title>${desktopMarker}</title></head><body>${desktopMarker}</body></html>`,
          htmlMobile: `<html><head><title>${mobileMarker}</title></head><body>${mobileMarker}</body></html>`,
          ogImage: SAMPLE_PNG_BASE64,
        }),
      })

      expect(uploadResponse.status).toBe(200)
      const uploadJson = asRecord(await uploadResponse.json(), "upload")
      const id = getString(uploadJson, "id", "upload")
      uploadedId = id

      const rawResponse = await fetch(`${BASE_URL}/raw/${id}`, {
        headers: { "Accept-Encoding": "identity" },
      })
      expect(rawResponse.status).toBe(200)
      const rawHtml = await rawResponse.text()
      expect(rawHtml).toContain(desktopMarker)
      expect(rawHtml).toContain(`/og/${id}.png`)

      const desktopViewResponse = await fetch(`${BASE_URL}/v/${id}?v=desktop`, {
        headers: { "Accept-Encoding": "identity" },
      })
      expect(desktopViewResponse.status).toBe(200)
      const desktopHtml = await desktopViewResponse.text()
      expect(desktopHtml).toContain(desktopMarker)

      const mobileViewResponse = await fetch(`${BASE_URL}/v/${id}?v=mobile`, {
        headers: { "Accept-Encoding": "identity" },
      })
      expect(mobileViewResponse.status).toBe(200)
      const mobileHtml = await mobileViewResponse.text()
      expect(mobileHtml).toContain(mobileMarker)

      const ogResponse = await fetch(`${BASE_URL}/og/${id}.png`, {
        headers: { "Accept-Encoding": "identity" },
      })
      expect(ogResponse.status).toBe(200)
      expect(ogResponse.headers.get("Content-Type")).toBe("image/png")
      const servedOgBytes = Buffer.from(await ogResponse.arrayBuffer())
      expect(servedOgBytes).toEqual(inputOgBytes)

      const deleteResponse = await fetch(`${BASE_URL}/v/${id}`, {
        method: "DELETE",
        headers: {
          [OWNER_SECRET_HEADER]: ownerSecret,
        },
      })
      expect(deleteResponse.status).toBe(200)
      uploadedId = null

      const deletedRawResponse = await fetch(`${BASE_URL}/raw/${id}`)
      expect(deletedRawResponse.status).toBe(404)
    } finally {
      if (uploadedId) {
        await fetch(`${BASE_URL}/v/${uploadedId}`, {
          method: "DELETE",
          headers: {
            [OWNER_SECRET_HEADER]: ownerSecret,
          },
        }).catch(() => undefined)
      }
    }
  }, 120_000)
})
