// Polyfill for terminal dimensions in Bun compiled binaries.
// Bun's `--compile` produces binaries where process.stdout.columns/rows are 0
// instead of the actual terminal size (even when isTTY is true).
// This must be imported before any opentui imports, since opentui reads
// stdout.columns at init time and uses `?? fallback` which doesn't catch 0.

import { execSync } from "child_process"

function getTerminalSize(): { cols: number; rows: number } | null {
  try {
    const cols = parseInt(
      execSync("tput cols", {
        encoding: "utf-8",
        stdio: ["inherit", "pipe", "pipe"],
      }).trim(),
    )
    const rows = parseInt(
      execSync("tput lines", {
        encoding: "utf-8",
        stdio: ["inherit", "pipe", "pipe"],
      }).trim(),
    )
    if (cols > 0 && rows > 0) return { cols, rows }
  } catch {}
  return null
}

if (process.stdout.isTTY && process.stdout.columns === 0) {
  const size = getTerminalSize()
  if (size) {
    Object.defineProperty(process.stdout, "columns", {
      value: size.cols,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(process.stdout, "rows", {
      value: size.rows,
      writable: true,
      configurable: true,
    })

    // Keep patched values updated on terminal resize
    process.on("SIGWINCH", () => {
      const newSize = getTerminalSize()
      if (newSize) {
        process.stdout.columns = newSize.cols
        process.stdout.rows = newSize.rows
      }
    })
  }
}
