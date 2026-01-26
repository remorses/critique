import { describe, test, expect, beforeAll } from "bun:test"
import fs from "fs"
import path from "path"

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
      console.log(path)
      // fs.unlinkSync(path)
    }
  })

  test("renderFrameToImages splits long content into multiple images", async () => {
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
    const { renderDiffToFrame } = await import("./web-utils.ts")
    const { calculateOgImageLayout } = await import("./image.ts")

    // Use a realistic diff with enough lines to fill the OG image
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

    // Render diff to frame
    const frame = await renderDiffToFrame(longDiff, {
      cols: 120,
      rows: 200,
      themeName: "tokyonight",
    })

    // Calculate layout
    const layout = calculateOgImageLayout(frame, {
      height: 630,
      themeName: "tokyonight",
    })

    // Verify layout calculations are sensible
    // With 56 total lines and 630px height at 18px font with 1.95 line-height (35px)
    // We can fit floor(590/35) = 16 lines
    expect(layout.totalLines).toBeGreaterThan(30)
    expect(layout.visibleLines).toBeGreaterThanOrEqual(15)

    // Unused height should be less than one line height
    // (no room for another full line)
    expect(layout.unusedHeight).toBeLessThan(layout.lineHeightPx)
  })

  test("renderDiffToOgImage writes example image", async () => {
    const { renderDiffToOgImage } = await import("./image.ts")

    const exampleDiff = `diff --git a/src/auth.ts b/src/auth.ts
index 846e706..ca0bb64 100644
--- a/src/auth.ts
+++ b/src/auth.ts
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

    const buffer = await renderDiffToOgImage(exampleDiff)

    const outputDir = path.join(process.cwd(), "tmp", "og-examples")
    fs.mkdirSync(outputDir, { recursive: true })
    const outputPath = path.join(outputDir, "og-example.png")
    fs.writeFileSync(outputPath, buffer)

    expect(fs.existsSync(outputPath)).toBe(true)
    expect(buffer.length).toBeGreaterThan(0)
  })
})
