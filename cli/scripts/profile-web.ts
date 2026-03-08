#!/usr/bin/env bun
// Profile the --web pipeline step by step.
// Usage: bun run scripts/profile-web.ts [commit-range]
// Example: bun run scripts/profile-web.ts HEAD~3

import { execSync } from "child_process"

const range = process.argv[2] || "HEAD~1"

const timers: { label: string; ms: number }[] = []
function time(label: string) {
  const start = performance.now()
  return {
    stop() {
      const ms = performance.now() - start
      timers.push({ label, ms })
      console.error(`  [${ms.toFixed(0)}ms] ${label}`)
      return ms
    },
  }
}

async function main() {
  const totalTimer = time("TOTAL")

  // ── Step 1: git diff ──
  const t1 = time("1. git diff")
  const diffContent = execSync(`git diff ${range} --no-color`, { encoding: "utf-8" })
  t1.stop()
  console.error(`     diff size: ${(diffContent.length / 1024).toFixed(1)} KB, ${diffContent.split("\n").length} lines`)

  // ── Step 2: imports / module loading ──
  const t2 = time("2. import modules")
  const { parsePatch } = await import("diff")
  const { stripSubmoduleHeaders, parseGitDiffFiles } = await import("../src/diff-utils.js")
  t2.stop()

  // ── Step 3: parse diff ──
  const t3 = time("3. parse diff")
  const cleaned = stripSubmoduleHeaders(diffContent)
  const files = parseGitDiffFiles(cleaned, parsePatch)
  t3.stop()
  console.error(`     files: ${files.length}`)

  // ── Step 4: captureResponsiveHtml (desktop + mobile in parallel, stabilizeMs=100) ──
  const t4 = time("4. captureResponsiveHtml (desktop + mobile, stabilizeMs=100, skipOg=true)")
  const { captureResponsiveHtml, uploadHtml, uploadOgImage } = await import("../src/web-utils.js")
  const { defaultThemeName } = await import("../src/themes.js")
  const baseRows = files.reduce((sum, file) => {
    const diffLines = file.hunks.reduce((h, hunk) => h + hunk.lines.length, 0)
    return sum + diffLines + 5
  }, 100)

  const { htmlDesktop, htmlMobile } = await captureResponsiveHtml(cleaned, {
    desktopCols: 230,
    mobileCols: 100,
    baseRows,
    themeName: defaultThemeName,
    title: "Profile test",
    stabilizeMs: 100,
    skipOgImage: true,
  })
  t4.stop()
  console.error(`     Desktop HTML: ${(htmlDesktop.length / 1024).toFixed(1)} KB, Mobile: ${(htmlMobile.length / 1024).toFixed(1)} KB`)

  // ── Step 5: upload HTML (no OG) ──
  const t5 = time("5. upload HTML (no OG image)")
  const result = await uploadHtml(htmlDesktop, htmlMobile)
  t5.stop()
  console.error(`     URL: ${result.url}`)

  // ── At this point URL is printed ──
  const urlPrinted = timers.reduce((sum, t) => sum + t.ms, 0) - timers[0]!.ms // subtract TOTAL
  console.error(`\n  ⚡ URL available at: ${urlPrinted.toFixed(0)}ms`)

  // ── Step 6: OG image generation + upload (background) ──
  const t6 = time("6. OG image render + upload (background)")
  try {
    const { renderDiffToOgImage } = await import("../src/image.js")
    const ogImg = await renderDiffToOgImage(cleaned, {
      themeName: "github-light",
      stabilizeMs: 100,
    })
    if (ogImg) {
      console.error(`     OG image size: ${(ogImg.length / 1024).toFixed(1)} KB`)
      await uploadOgImage(result.id, ogImg)
    }
  } catch (e) {
    console.error("     OG image skipped")
  }
  t6.stop()

  totalTimer.stop()

  console.error("\n── Summary ──")
  const total = timers.find(t => t.label === "TOTAL")!.ms
  for (const t of timers) {
    const pct = ((t.ms / total) * 100).toFixed(1)
    const bar = "█".repeat(Math.round(Number(pct) / 2))
    console.error(`  ${t.ms.toFixed(0).padStart(5)}ms  ${pct.padStart(5)}%  ${bar}  ${t.label}`)
  }
}

main().catch(console.error)
