// The CLI encrypts with diff-crypto.ts and browsers decrypt with the DECRYPT_JS string.
// This runs both against each other so the two copies of the envelope format cannot drift.

import { describe, expect, test } from "bun:test"
import { DECRYPT_JS, decryptDiffBlob, encryptDiffBlobs, importDiffKey, isEnvelope } from "./diff-crypto.js"

type BrowserDecrypt = {
  critiqueImportPassword: (password: string) => Promise<CryptoKey>
  critiqueDecrypt: (options: { baseKey: CryptoKey; kind: string; envelope: Uint8Array }) => Promise<string | null>
}

const browser = new Function(`${DECRYPT_JS}\nreturn { critiqueImportPassword, critiqueDecrypt }`)() as BrowserDecrypt

describe("diff encryption", () => {
  test("browser and curl key decrypt what the CLI encrypted", async () => {
    const html = "<!DOCTYPE html><html><body>héllo 🔒</body></html>"
    const patch = "diff --git a/a.txt b/a.txt\n-old\n+new\n"
    const { envelopes, key } = await encryptDiffBlobs({ password: "correct horse", blobs: { html, patch } })
    const htmlEnvelope = envelopes.html!
    const patchEnvelope = envelopes.patch!

    expect(envelopes.mobile).toBeUndefined()
    expect(isEnvelope(htmlEnvelope)).toBe(true)
    expect(new TextDecoder().decode(htmlEnvelope)).not.toContain("héllo")
    // One salt per diff: both headers match up to the IV
    expect(htmlEnvelope.subarray(0, 24)).toEqual(patchEnvelope.subarray(0, 24))

    const rightKey = await browser.critiqueImportPassword("correct horse")
    const wrongKey = await browser.critiqueImportPassword("wrong horse")
    const [right, wrong, swapped] = await Promise.all([
      browser.critiqueDecrypt({ baseKey: rightKey, kind: "html", envelope: htmlEnvelope }),
      browser.critiqueDecrypt({ baseKey: wrongKey, kind: "html", envelope: htmlEnvelope }),
      browser.critiqueDecrypt({ baseKey: rightKey, kind: "html", envelope: patchEnvelope }),
    ])
    expect(right).toBe(html)
    expect(wrong).toBeNull()
    expect(swapped).toBeNull()

    const cookieKey = await importDiffKey(key)
    expect(cookieKey).not.toBeNull()
    expect(await decryptDiffBlob({ key: cookieKey!, kind: "patch", envelope: patchEnvelope })).toBe(patch)
    expect(await decryptDiffBlob({ key: cookieKey!, kind: "patch", envelope: htmlEnvelope })).toBeNull()

    const otherDiff = await encryptDiffBlobs({ password: "correct horse", blobs: { patch } })
    expect(otherDiff.key).not.toBe(key)
    expect(await decryptDiffBlob({ key: cookieKey!, kind: "patch", envelope: otherDiff.envelopes.patch! })).toBeNull()
    expect(await importDiffKey("not-a-key")).toBeNull()
  })
})
