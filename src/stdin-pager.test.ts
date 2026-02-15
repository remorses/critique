// Integration tests for --stdin pager mode (lazygit integration).
// Reproduces https://github.com/remorses/critique/issues/25
//
// Uses tuistory to launch critique in a PTY (exactly like lazygit does),
// pipes a real diff via stdin, and verifies the output is plain scrollback
// text — not interactive TUI escape sequences.
//
// tuistory spawns a PTY where isTTY=true, which is exactly how lazygit
// runs its pager (via github.com/creack/pty). This makes the test
// realistic: it catches the original bug where --stdin + TTY incorrectly
// entered interactive TUI mode instead of scrollback mode.

import { describe, test, expect, afterAll, beforeAll } from "bun:test"
import { launchTerminal } from "tuistory"
import fs from "fs"
import path from "path"

const TEMP_DIR = path.join(import.meta.dir, ".test-stdin-pager-tmp")

function tempFile(name: string, content: string): string {
  const p = path.join(TEMP_DIR, name)
  fs.writeFileSync(p, content)
  return p
}

function launchCritique(diffPath: string, opts?: { cols?: number; rows?: number }) {
  return launchTerminal({
    command: "bash",
    args: ["-c", `cat "${diffPath}" | bun run src/cli.tsx --stdin`],
    cols: opts?.cols ?? 100,
    rows: opts?.rows ?? 30,
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TERM: "xterm-256color",
    },
  })
}

// -- Sample diffs --

const SINGLE_FILE_DIFF = [
  "diff --git a/src/hello.ts b/src/hello.ts",
  "--- a/src/hello.ts",
  "+++ b/src/hello.ts",
  "@@ -1,3 +1,3 @@",
  " const greeting = 'hello'",
  "-console.log(greeting)",
  "+console.log(greeting + ' world')",
  " export default greeting",
].join("\n")

// Empty patch — lazygit sends this when there are no changes for a file
const EMPTY_DIFF = ""

// Diff with only context lines and no actual changes (can happen with -U999)
const CONTEXT_ONLY_DIFF = [
  "diff --git a/readme.md b/readme.md",
  "--- a/readme.md",
  "+++ b/readme.md",
  "@@ -1,3 +1,3 @@",
  " # My Project",
  " ",
  " Some description",
].join("\n")

// Multiple files in a single diff
const MULTI_FILE_DIFF = [
  "diff --git a/src/index.ts b/src/index.ts",
  "--- a/src/index.ts",
  "+++ b/src/index.ts",
  "@@ -1,4 +1,6 @@",
  " import { App } from './app'",
  "+import { Logger } from './logger'",
  " ",
  " const app = new App()",
  "+const logger = new Logger()",
  " app.start()",
  "diff --git a/src/logger.ts b/src/logger.ts",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/src/logger.ts",
  "@@ -0,0 +1,5 @@",
  "+export class Logger {",
  "+  log(msg: string) {",
  "+    console.log(`[LOG] ${msg}`)",
  "+  }",
  "+}",
].join("\n")

// Deletion-only diff
const DELETE_ONLY_DIFF = [
  "diff --git a/src/deprecated.ts b/src/deprecated.ts",
  "deleted file mode 100644",
  "--- a/src/deprecated.ts",
  "+++ /dev/null",
  "@@ -1,4 +0,0 @@",
  "-// This module is no longer needed",
  "-export function oldHelper() {",
  "-  return 'deprecated'",
  "-}",
].join("\n")

// Addition-only diff (new file)
const NEW_FILE_DIFF = [
  "diff --git a/src/utils.ts b/src/utils.ts",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/src/utils.ts",
  "@@ -0,0 +1,7 @@",
  "+export function clamp(value: number, min: number, max: number): number {",
  "+  return Math.min(Math.max(value, min), max)",
  "+}",
  "+",
  "+export function identity<T>(x: T): T {",
  "+  return x",
  "+}",
].join("\n")

// Large hunk with many changes
const LARGE_HUNK_DIFF = [
  "diff --git a/config.json b/config.json",
  "--- a/config.json",
  "+++ b/config.json",
  "@@ -1,9 +1,11 @@",
  " {",
  '-  "name": "my-app",',
  '+  "name": "my-awesome-app",',
  '-  "version": "1.0.0",',
  '+  "version": "2.0.0",',
  '   "description": "A sample app",',
  '-  "main": "index.js",',
  '+  "main": "dist/index.js",',
  '+  "types": "dist/index.d.ts",',
  '   "scripts": {',
  '-    "build": "tsc"',
  '+    "build": "tsc --project tsconfig.build.json",',
  '+    "test": "bun test"',
  "   }",
  " }",
].join("\n")

// Rename diff (common in lazygit)
const RENAME_DIFF = [
  "diff --git a/src/old-name.ts b/src/new-name.ts",
  "similarity index 90%",
  "rename from src/old-name.ts",
  "rename to src/new-name.ts",
  "--- a/src/old-name.ts",
  "+++ b/src/new-name.ts",
  "@@ -1,3 +1,3 @@",
  "-export const name = 'old'",
  "+export const name = 'new'",
  " export const version = 1",
  " export default name",
].join("\n")

// Binary file diff (lazygit shows these)
const BINARY_DIFF = [
  "diff --git a/logo.png b/logo.png",
  "new file mode 100644",
  "Binary files /dev/null and b/logo.png differ",
].join("\n")

describe("--stdin pager mode (lazygit issue #25)", () => {
  beforeAll(() => {
    fs.mkdirSync(TEMP_DIR, { recursive: true })
  })

  afterAll(() => {
    try {
      fs.rmSync(TEMP_DIR, { recursive: true })
    } catch {}
  })

  test("single file change", async () => {
    const diffPath = tempFile("single.diff", SINGLE_FILE_DIFF)
    const session = await launchCritique(diffPath)
    await session.waitForText("hello", { timeout: 15000 })
    const trimmed = await session.text({ trimEnd: true })

    expect(trimmed).toMatchInlineSnapshot(`
      "
       a/src/hello.ts → b/src/hello.ts +1-1

       1   const greeting = 'hello'
       2 - console.log(greeting)
       2 + console.log(greeting + ' world')
       3   export default greeting"
    `)

    const lines = trimmed.split("\n").filter((l) => l.trim().length > 0)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.length).toBeLessThan(25)
    session.close()
  }, 30000)

  test("empty diff produces no crash", async () => {
    const diffPath = tempFile("empty.diff", EMPTY_DIFF)
    const session = await launchCritique(diffPath)

    // Empty diff should cause critique to exit quickly.
    // Wait a bit for it to process and exit.
    await new Promise((r) => setTimeout(r, 5000))
    const trimmed = await session.text({ trimEnd: true, immediate: true })

    // Should either be empty or show an error message — not a TUI
    expect(trimmed).toMatchInlineSnapshot(`
      "
      No changes to display"
    `)

    session.close()
  }, 15000)

  test("context-only diff (no actual changes)", async () => {
    const diffPath = tempFile("context-only.diff", CONTEXT_ONLY_DIFF)
    const session = await launchCritique(diffPath)

    await new Promise((r) => setTimeout(r, 5000))
    const trimmed = await session.text({ trimEnd: true, immediate: true })

    expect(trimmed).toMatchInlineSnapshot(`
      "
       a/readme.md → b/readme.md +0-0

       1 # My Project
       2
       3 Some description"
    `)

    session.close()
  }, 15000)

  test("multiple files in one diff", async () => {
    const diffPath = tempFile("multi.diff", MULTI_FILE_DIFF)
    const session = await launchCritique(diffPath)
    await session.waitForText("Logger", { timeout: 15000 })
    const trimmed = await session.text({ trimEnd: true })

    expect(trimmed).toMatchInlineSnapshot(`
      "
       b/src/logger.ts +5-0

       1 + export class Logger {
       2 +   log(msg: string) {
       3 +     console.log(\`[LOG] \${msg}\`)
       4 +   }
       5 + }


       a/src/index.ts → b/src/index.ts +2-0

       1   import { App } from './app'
       2 + import { Logger } from './logger'
       3
       4   const app = new App()
       5 + const logger = new Logger()
       6   app.start()"
    `)

    // Should contain both filenames
    expect(trimmed).toContain("index.ts")
    expect(trimmed).toContain("logger.ts")

    // Should not show the privacy notice
    expect(trimmed).not.toContain("URL is private")

    const lines = trimmed.split("\n").filter((l) => l.trim().length > 0)
    expect(lines.length).toBeLessThan(40)
    session.close()
  }, 30000)

  test("deleted file", async () => {
    const diffPath = tempFile("delete.diff", DELETE_ONLY_DIFF)
    const session = await launchCritique(diffPath)
    await session.waitForText("deprecated", { timeout: 15000 })
    const trimmed = await session.text({ trimEnd: true })

    expect(trimmed).toMatchInlineSnapshot(`
      "
       a/src/deprecated.ts +0-4

       1 - // This module is no longer needed
       2 - export function oldHelper() {
       3 -   return 'deprecated'
       4 - }"
    `)

    expect(trimmed).toContain("deprecated")
    expect(trimmed).not.toContain("URL is private")
    session.close()
  }, 30000)

  test("new file", async () => {
    const diffPath = tempFile("newfile.diff", NEW_FILE_DIFF)
    const session = await launchCritique(diffPath)
    await session.waitForText("clamp", { timeout: 15000 })
    const trimmed = await session.text({ trimEnd: true })

    expect(trimmed).toMatchInlineSnapshot(`
      "
       b/src/utils.ts +7-0

       1 + export function clamp(value: number, min: number, max: number): number {
       2 +   return Math.min(Math.max(value, min), max)
       3 + }
       4 +
       5 + export function identity<T>(x: T): T {
       6 +   return x
       7 + }"
    `)

    expect(trimmed).toContain("clamp")
    expect(trimmed).toContain("identity")
    expect(trimmed).not.toContain("URL is private")
    session.close()
  }, 30000)

  test("large hunk with many changes", async () => {
    const diffPath = tempFile("large.diff", LARGE_HUNK_DIFF)
    const session = await launchCritique(diffPath)
    await session.waitForText("config.json", { timeout: 15000 })
    const trimmed = await session.text({ trimEnd: true })

    expect(trimmed).toMatchInlineSnapshot(`
      "
       a/config.json → b/config.json +6-4

        1   {
        2 -   "name": "my-app",
        3 -   "version": "1.0.0",
        2 +   "name": "my-awesome-app",
        3 +   "version": "2.0.0",
        4     "description": "A sample app",
        5 -   "main": "index.js",
        5 +   "main": "dist/index.js",
        6 +   "types": "dist/index.d.ts",
        7     "scripts": {
        7 -     "build": "tsc"
        8 +     "build": "tsc --project tsconfig.build.json",
        9 +     "test": "bun test"
       10     }
       11   }"
    `)

    expect(trimmed).toContain("config.json")
    expect(trimmed).toContain("my-awesome-app")
    expect(trimmed).not.toContain("URL is private")
    session.close()
  }, 30000)

  test("file rename with changes", async () => {
    const diffPath = tempFile("rename.diff", RENAME_DIFF)
    const session = await launchCritique(diffPath)
    await session.waitForText("new-name", { timeout: 15000 })
    const trimmed = await session.text({ trimEnd: true })

    expect(trimmed).toMatchInlineSnapshot(`
      "
       src/old-name.ts → src/new-name.ts +1-1

       1 - export const name = 'old'
       1 + export const name = 'new'
       2   export const version = 1
       3   export default name"
    `)

    // Should show the rename
    expect(trimmed).toContain("old-name")
    expect(trimmed).toContain("new-name")
    expect(trimmed).not.toContain("URL is private")
    session.close()
  }, 30000)

  test("binary file diff", async () => {
    const diffPath = tempFile("binary.diff", BINARY_DIFF)
    const session = await launchCritique(diffPath)

    // Binary diffs may not render content — wait for exit or timeout
    await new Promise((r) => setTimeout(r, 5000))
    const trimmed = await session.text({ trimEnd: true, immediate: true })

    expect(trimmed).toMatchInlineSnapshot(`
      "
       unknown +0-0"
    `)

    expect(trimmed).not.toContain("URL is private")
    session.close()
  }, 15000)

  test("narrow terminal (40 cols) forces unified view", async () => {
    const diffPath = tempFile("narrow.diff", SINGLE_FILE_DIFF)
    const session = await launchCritique(diffPath, { cols: 40 })
    await session.waitForText("hello", { timeout: 15000 })
    const trimmed = await session.text({ trimEnd: true })

    expect(trimmed).toMatchInlineSnapshot(`
      "
       a/src/hello.ts → b/src/hello.ts +1-1

       1   const greeting = 'hello'
       2 - console.log(greeting)
       2 + console.log(greeting + ' world')
       3   export default greeting"
    `)

    expect(trimmed).toContain("hello")
    expect(trimmed).not.toContain("URL is private")

    // Every non-empty line should fit within 40 cols
    const lines = trimmed.split("\n").filter((l) => l.trim().length > 0)
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(40)
    }
    session.close()
  }, 30000)
})
