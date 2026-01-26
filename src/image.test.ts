import { describe, test, expect, beforeAll } from "bun:test"
import fs from "fs"

// Check if takumi is available (optional dependency)
let takumiAvailable = false
beforeAll(async () => {
  try {
    await import("@takumi-rs/core")
    await import("@takumi-rs/helpers")
    takumiAvailable = true
  } catch {
    console.log("Skipping image tests: takumi not installed")
  }
})

describe("image rendering", () => {
  // Valid unified diff format - each line in hunk must start with +, -, or space
  // Hunk header: @@ -old_start,old_count +new_start,new_count @@
  const sampleDiff = `diff --git a/src/utils.ts b/src/utils.ts
index 1234567..abcdefg 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,3 +1,7 @@
 export function add(a: number, b: number) {
   return a + b
 }
+
+export function subtract(a: number, b: number) {
+  return a - b
+}
`

  test("renderDiffToImages generates WebP images", async () => {
    if (!takumiAvailable) {
      console.log("Skipping: takumi not installed")
      return
    }

    const { renderDiffToImages } = await import("./image.ts")

    const result = await renderDiffToImages(sampleDiff, {
      cols: 80,
      themeName: "tokyonight",
      maxLinesPerImage: 50,
    })

    // Should generate at least one image
    expect(result.imageCount).toBeGreaterThanOrEqual(1)
    expect(result.images.length).toBe(result.imageCount)
    expect(result.paths.length).toBe(result.imageCount)
    expect(result.totalLines).toBeGreaterThan(0)

    // First image should be a valid buffer
    expect(result.images[0]).toBeInstanceOf(Buffer)
    expect(result.images[0]!.length).toBeGreaterThan(0)

    // Files should exist in /tmp
    for (const path of result.paths) {
      expect(fs.existsSync(path)).toBe(true)
      // Clean up test files
      fs.unlinkSync(path)
    }
  })

  test("renderFrameToImages splits long content into multiple images", async () => {
    if (!takumiAvailable) {
      console.log("Skipping: takumi not installed")
      return
    }

    const { renderDiffToFrame } = await import("./web-utils.ts")
    const { renderFrameToImages } = await import("./image.ts")

    // Create a frame with enough lines to split
    const longDiff = `diff --git a/long.ts b/long.ts
new file mode 100644
--- /dev/null
+++ b/long.ts
@@ -0,0 +1,100 @@
${Array.from({ length: 100 }, (_, i) => `+line ${i + 1}: some content here`).join("\n")}
`

    const frame = await renderDiffToFrame(longDiff, {
      cols: 80,
      rows: 200,
      themeName: "tokyonight",
    })

    const result = await renderFrameToImages(frame, {
      maxLinesPerImage: 30,
      themeName: "tokyonight",
    })

    // Should split into multiple images (100+ lines / 30 = at least 3 images)
    expect(result.imageCount).toBeGreaterThan(1)
    expect(result.images.length).toBe(result.imageCount)

    // Clean up
    for (const path of result.paths) {
      if (fs.existsSync(path)) fs.unlinkSync(path)
    }
  })

  test("renderFrameToImages supports different formats", async () => {
    if (!takumiAvailable) {
      console.log("Skipping: takumi not installed")
      return
    }

    const { renderDiffToImages } = await import("./image.ts")

    // Test PNG format
    const pngResult = await renderDiffToImages(sampleDiff, {
      cols: 80,
      format: "png",
    })

    expect(pngResult.paths[0]).toContain(".png")
    expect(pngResult.images[0]!.length).toBeGreaterThan(0)

    // Clean up
    for (const path of pngResult.paths) {
      if (fs.existsSync(path)) fs.unlinkSync(path)
    }
  })

  test("throws error when no content to render", async () => {
    if (!takumiAvailable) {
      console.log("Skipping: takumi not installed")
      return
    }

    const { renderFrameToImages } = await import("./image.ts")

    // Empty frame
    const emptyFrame = {
      cols: 80,
      rows: 10,
      cursor: [0, 0] as [number, number],
      lines: [],
    }

    await expect(renderFrameToImages(emptyFrame)).rejects.toThrow("No content to render")
  })

  test("renderDiffToOgImage generates 1200x630 PNG image", async () => {
    if (!takumiAvailable) {
      console.log("Skipping: takumi not installed")
      return
    }

    const { renderDiffToOgImage } = await import("./image.ts")

    const result = await renderDiffToOgImage(sampleDiff, {
      themeName: "tokyonight",
    })

    // Should return a buffer
    expect(result).toBeInstanceOf(Buffer)
    expect(result.length).toBeGreaterThan(0)

    // PNG files start with specific magic bytes
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    expect(result.subarray(0, 4).equals(pngMagic)).toBe(true)
  })

  test("renderDiffToOgImage respects custom dimensions", async () => {
    if (!takumiAvailable) {
      console.log("Skipping: takumi not installed")
      return
    }

    const { renderDiffToOgImage } = await import("./image.ts")

    const result = await renderDiffToOgImage(sampleDiff, {
      width: 800,
      height: 400,
      format: "webp",
    })

    expect(result).toBeInstanceOf(Buffer)
    expect(result.length).toBeGreaterThan(0)
  })

  test("renderDiffToOgImage fills vertical space with content lines", async () => {
    if (!takumiAvailable) {
      console.log("Skipping: takumi not installed")
      return
    }

    const { PNG } = await import("pngjs")
    const { renderDiffToOgImage } = await import("./image.ts")

    // Use a realistic diff that shows the bottom gap issue
    // This diff has ~50 lines which should fill the OG image but leaves gaps
    const longDiff = `diff --git a/auth.ts b/auth.ts
index 846e706..ca0bb64 100644
--- a/auth.ts
+++ b/auth.ts
@@ -1,14 +1,46 @@
-import { hash } from "bcrypt"
+import { hash, compare } from "bcrypt"
+import { sign, verify } from "jsonwebtoken"
+import { z } from "zod"
 
-export async function createUser(email: string, password: string) {
-  const hashedPassword = await hash(password, 10)
-  return db.user.create({
-    data: { email, password: hashedPassword }
+const userSchema = z.object({
+  email: z.string().email(),
+  password: z.string().min(8),
+  name: z.string().optional(),
+})
+
+export async function createUser(input: z.infer<typeof userSchema>) {
+  const validated = userSchema.parse(input)
+  const hashedPassword = await hash(validated.password, 12)
+  const user = await db.user.create({
+    data: {
+      email: validated.email,
+      password: hashedPassword,
+      name: validated.name,
+    }
   })
+  return { id: user.id, email: user.email }
 }
 
-export async function login(email: string, password: string) {
-  const user = await db.user.findUnique({ where: { email } })
+export async function login(email: string, password: string): Promise<string | null> {
+  const user = await db.user.findUnique({
+    where: { email },
+    select: { id: true, email: true, password: true }
+  })
   if (!user) return null
-  return user
+  const valid = await compare(password, user.password)
+  if (!valid) return null
+  const token = sign(
+    { userId: user.id, email: user.email },
+    process.env.JWT_SECRET!,
+    { expiresIn: "7d" }
+  )
+  return token
+}
+
+export async function verifyToken(token: string) {
+  try {
+    return verify(token, process.env.JWT_SECRET!)
+  } catch {
+    return null
+  }
 }
`

    const height = 630
    const expectedPadding = 20
    const maxAllowedPadding = 25 // Allow small tolerance

    const result = await renderDiffToOgImage(longDiff, {
      themeName: "tokyonight",
      height,
      format: "png",
    })

    // Decode PNG to check pixel content
    const png = PNG.sync.read(result)

    // Tokyo Night background color is approximately #1a1b26 (26, 27, 38)
    const bgColor = { r: 26, g: 27, b: 38 }
    const tolerance = 10

    function isBackgroundColor(r: number, g: number, b: number): boolean {
      return (
        Math.abs(r - bgColor.r) <= tolerance &&
        Math.abs(g - bgColor.g) <= tolerance &&
        Math.abs(b - bgColor.b) <= tolerance
      )
    }

    // Scan from top to find where content starts
    let contentStartY = 0
    for (let y = 0; y < png.height; y++) {
      const idx = (y * png.width + 300) * 4
      const r = png.data[idx]!
      const g = png.data[idx + 1]!
      const b = png.data[idx + 2]!
      if (!isBackgroundColor(r, g, b)) {
        contentStartY = y
        break
      }
    }

    // Scan from bottom to find where content ends
    let contentEndY = png.height - 1
    for (let y = png.height - 1; y >= 0; y--) {
      const idx = (y * png.width + 300) * 4
      const r = png.data[idx]!
      const g = png.data[idx + 1]!
      const b = png.data[idx + 2]!
      if (!isBackgroundColor(r, g, b)) {
        contentEndY = y
        break
      }
    }

    const topPadding = contentStartY
    const bottomPadding = png.height - 1 - contentEndY

    // Content should fill the vertical space with minimal padding
    // Currently fails: top ~60px (header + empty line), bottom ~50px (wasted space)
    expect(topPadding + bottomPadding).toBeLessThanOrEqual(maxAllowedPadding * 2)
  })
})
