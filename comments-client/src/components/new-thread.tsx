// NewThread — handles the 3-state flow for placing a new comment pin on the page.
//
// States:
//   "idle"    → user hasn't started placing
//   "placing" → custom cursor shown, waiting for click on page
//   "placed"  → composer visible at click position, waiting for submit or cancel

import { useState, useRef, useEffect } from "react"
import { useComments } from "./provider.js"
import { getCoordsFromPointerEvent, type AccurateCursorPositions } from "../lib/coords.js"
import { Composer } from "./composer.js"
import { useMaxZIndex } from "../hooks/use-max-z-index.js"

export type PlacementState = "idle" | "placing" | "placed"

export interface NewThreadProps {
  /** Called when placement state changes (for toggling cursor styles) */
  onStateChange?: (state: PlacementState) => void
}

export function NewThread({ onStateChange }: NewThreadProps) {
  const { createThread, threads } = useComments()
  const maxZIndex = useMaxZIndex(threads)

  const [state, setState] = useState<PlacementState>("idle")
  const [composerCoords, setComposerCoords] = useState<{ x: number; y: number } | null>(null)
  const cursorPositionsRef = useRef<AccurateCursorPositions | null>(null)
  const clickHandlerRef = useRef<((e: MouseEvent) => void) | null>(null)
  const escapeHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null)

  function cleanupListeners() {
    if (clickHandlerRef.current) {
      document.removeEventListener("click", clickHandlerRef.current, true)
      clickHandlerRef.current = null
    }
    if (escapeHandlerRef.current) {
      document.removeEventListener("keydown", escapeHandlerRef.current)
      escapeHandlerRef.current = null
    }
    document.documentElement.removeAttribute("data-cw-placing")
  }

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => cleanupListeners()
  }, [])

  function cancel() {
    cleanupListeners()
    setState("idle")
    onStateChange?.("idle")
    setComposerCoords(null)
    cursorPositionsRef.current = null
  }

  function startPlacing() {
    setState("placing")
    onStateChange?.("placing")
    document.documentElement.setAttribute("data-cw-placing", "true")

    const handleClick = (e: MouseEvent) => {
      // Ignore clicks on the toolbar itself
      const target = e.target as HTMLElement
      if (target.closest(".cw-toolbar") || target.closest(".cw-sidebar-wrapper")) {
        return
      }

      e.preventDefault()
      e.stopPropagation()

      const positions = getCoordsFromPointerEvent(e)
      if (!positions) {
        cancel()
        return
      }

      cursorPositionsRef.current = positions
      // Use clientX/Y for fixed positioning
      setComposerCoords({
        x: e.clientX,
        y: e.clientY,
      })
      setState("placed")
      onStateChange?.("placed")
      cleanupListeners()
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancel()
      }
    }

    clickHandlerRef.current = handleClick
    escapeHandlerRef.current = handleEscape

    // Use capture to get the click before anything else
    document.addEventListener("click", handleClick, true)
    document.addEventListener("keydown", handleEscape)
  }

  async function handleSubmit(body: string) {
    const positions = cursorPositionsRef.current
    if (!positions) return

    await createThread({
      body,
      metadata: {
        cursorSelectors: positions.cursorSelectors.join(","),
        cursorX: positions.cursorX,
        cursorY: positions.cursorY,
        zIndex: maxZIndex + 1,
      },
    })

    cancel()
  }

  return (
    <>
      {/* The + button in the toolbar triggers placement mode */}
      <button
        className={`cw-btn cw-btn-ghost cw-btn-square ${state === "placing" ? "cw-btn-active" : ""}`}
        onClick={state === "idle" ? startPlacing : cancel}
        aria-label={state === "idle" ? "New comment" : "Cancel placement"}
        title="New comment"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* Floating composer at the click position */}
      {state === "placed" && composerCoords && (
        <div
          className="cw-pinned-composer"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            transform: `translate(${composerCoords.x}px, ${composerCoords.y}px)`,
            zIndex: 9999999,
          }}
        >
          <div className="cw-pin-avatar cw-pin-avatar-new">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div className="cw-thread">
            <Composer onSubmit={handleSubmit} onCancel={cancel} autoFocus placeholder="Add a comment..." />
          </div>
        </div>
      )}
    </>
  )
}
