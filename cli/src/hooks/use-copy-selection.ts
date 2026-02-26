// Hook for copy-to-clipboard on mouse selection release.
// Automatically copies selected text to clipboard when user releases mouse button.
// Uses native clipboard commands (pbcopy, xclip, etc.) with OSC52 fallback.

import { useRenderer } from "@opentuah/react"
import { spawn } from "child_process"

/**
 * Copy text to system clipboard using native commands.
 * Falls back to OSC52 escape sequence for terminal clipboard (works over SSH).
 */
async function copyToClipboard(text: string): Promise<void> {
  const platform = process.platform

  // Try native clipboard commands
  try {
    if (platform === "darwin") {
      // macOS: use pbcopy
      await spawnClipboard("pbcopy", [], text)
      return
    }

    if (platform === "linux") {
      // Linux: try wl-copy (Wayland), then xclip, then xsel
      const isWayland = !!process.env.WAYLAND_DISPLAY

      if (isWayland) {
        try {
          await spawnClipboard("wl-copy", [], text)
          return
        } catch {
          // Fall through to X11 tools
        }
      }

      try {
        await spawnClipboard("xclip", ["-selection", "clipboard"], text)
        return
      } catch {
        // Try xsel
      }

      try {
        await spawnClipboard("xsel", ["--clipboard", "--input"], text)
        return
      } catch {
        // Fall through to OSC52
      }
    }

    if (platform === "win32") {
      // Windows: use clip.exe
      await spawnClipboard("clip.exe", [], text)
      return
    }
  } catch {
    // Native clipboard failed, fall through to OSC52
  }

  // Fallback: OSC52 escape sequence (works in many terminals, including over SSH)
  const encoded = Buffer.from(text).toString("base64")
  process.stdout.write(`\x1b]52;c;${encoded}\x07`)
}

/**
 * Spawn a clipboard command and pipe text to it
 */
function spawnClipboard(cmd: string, args: string[], text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] })

    proc.on("error", reject)
    proc.on("close", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited with code ${code}`))
    })

    proc.stdin?.write(text)
    proc.stdin?.end()
  })
}

/**
 * Props for the mouseup handler returned by useCopySelection
 */
export interface CopySelectionHandlers {
  /** Attach this to the root box's onMouseUp prop */
  onMouseUp: () => Promise<void>
}

/**
 * Hook that provides a mouseup handler for copy-on-selection behavior.
 * When the user releases the mouse button after selecting text,
 * the selected text is automatically copied to the clipboard.
 *
 * @returns Object with onMouseUp handler to attach to root component
 *
 * @example
 * ```tsx
 * function App() {
 *   const { onMouseUp } = useCopySelection()
 *
 *   return (
 *     <box onMouseUp={onMouseUp}>
 *       <text>Select this text and release to copy</text>
 *     </box>
 *   )
 * }
 * ```
 */
export function useCopySelection(): CopySelectionHandlers {

  const renderer = useRenderer()

  const onMouseUp = async () => {
    const selection = renderer.getSelection()
    if (!selection) return

    const text = selection.getSelectedText()
    if (!text || text.length === 0) return

    try {
      await copyToClipboard(text)
    } catch {
      // Silent fail - user can manually copy if needed
    }

    renderer.clearSelection()
  }

  return { onMouseUp }
}
