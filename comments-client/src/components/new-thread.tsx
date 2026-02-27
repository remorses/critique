// NewThread — toggleable commenting mode (Vercel-style).
//
// States:
//   "idle"        → normal page interaction
//   "commenting"  → cursor changes, hovering highlights elements, click/tap places pin
//   "composing"   → composer visible at pinned position, waiting for submit or cancel
//
// Toggle via the toolbar button or keyboard shortcut "C".
// On desktop: mousemove tracks hovered element with highlight overlay.
// On mobile: tap directly places pin on the element under the touch point.
//
// Key implementation detail: elementFromPoint can return our own overlay elements
// (highlight, toolbar, etc.) even when they have pointer-events:none. So we always
// use getElementBeneath() which temporarily hides our UI to find the real page element.

import { useState, useRef, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { useComments } from "./provider.js"
import {
  getCoordsFromElement,
  type AccurateCursorPositions,
} from "../lib/coords.js"
import { Composer } from "./composer.js"
import { useMaxZIndex } from "../hooks/use-max-z-index.js"

export type CommentingState = "idle" | "commenting" | "composing"

export interface NewThreadProps {
  /** Called when commenting state changes */
  onStateChange?: (state: CommentingState) => void
}

/** Check if an element is part of our own comment UI (should not be a comment target) */
function isOwnUI(el: Element): boolean {
  return !!el.closest(".cw-toolbar, .cw-sidebar-wrapper, .cw-overlay, .cw-pinned-composer, .cw-highlight-overlay, #cw-root")
}

/** Normalize event target to Element (handles Text nodes in Safari) */
function toElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target
  if (target instanceof Text) return target.parentElement
  return null
}

/**
 * Find the real page element at a point, hiding our UI temporarily.
 * elementFromPoint returns the topmost element even with pointer-events:none,
 * so we hide #cw-root briefly to see through to the actual page content.
 */
function getPageElementAt(x: number, y: number): Element | null {
  const root = document.getElementById("cw-root")
  if (!root) return document.elementFromPoint(x, y)

  const prev = root.style.display
  root.style.display = "none"
  const el = document.elementFromPoint(x, y)
  root.style.display = prev
  return el
}

const LOG = "[cw]"

export function NewThread({ onStateChange }: NewThreadProps) {
  const { createThread, threads } = useComments()
  const maxZIndex = useMaxZIndex(threads)

  const [state, setState] = useState<CommentingState>("idle")
  const [composerCoords, setComposerCoords] = useState<{ x: number; y: number } | null>(null)
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null)

  const cursorPositionsRef = useRef<AccurateCursorPositions | null>(null)
  const highlightedElRef = useRef<Element | null>(null)
  const stateRef = useRef<CommentingState>("idle")

  // Keep ref in sync so event handlers always see latest state
  stateRef.current = state

  function updateHighlight(x: number, y: number) {
    const el = getPageElementAt(x, y)
    if (el) {
      highlightedElRef.current = el
      setHighlightRect(el.getBoundingClientRect())
    } else {
      highlightedElRef.current = null
      setHighlightRect(null)
    }
  }

  const cancel = useCallback(() => {
    console.log(LOG, "cancel → idle")
    setState("idle")
    onStateChange?.("idle")
    setComposerCoords(null)
    setHighlightRect(null)
    cursorPositionsRef.current = null
    highlightedElRef.current = null
    document.documentElement.removeAttribute("data-cw-placing")
  }, [onStateChange])

  const placeAt = useCallback((el: Element, clientX: number, clientY: number) => {
    console.log(LOG, "placeAt", el.tagName, el.className, { clientX, clientY })
    const positions = getCoordsFromElement(el, clientX, clientY)
    if (!positions) {
      console.log(LOG, "placeAt failed: getCoordsFromElement returned null")
      cancel()
      return
    }

    console.log(LOG, "placeAt success, selectors:", positions.cursorSelectors.length)
    cursorPositionsRef.current = positions
    setComposerCoords({ x: clientX, y: clientY })
    setHighlightRect(null)
    highlightedElRef.current = null
    setState("composing")
    onStateChange?.("composing")
    document.documentElement.removeAttribute("data-cw-placing")
  }, [cancel, onStateChange])

  const startCommenting = useCallback(() => {
    console.log(LOG, "start commenting")
    setState("commenting")
    onStateChange?.("commenting")
    document.documentElement.setAttribute("data-cw-placing", "true")
  }, [onStateChange])

  function toggle() {
    console.log(LOG, "toggle, current:", stateRef.current)
    if (stateRef.current === "idle") {
      startCommenting()
    } else {
      cancel()
    }
  }

  // Global event listeners for commenting mode
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (stateRef.current !== "commenting") return
      updateHighlight(e.clientX, e.clientY)
    }

    function handleClick(e: MouseEvent) {
      if (stateRef.current !== "commenting") return

      // Let clicks on our own UI through (toolbar button, sidebar, etc.)
      const target = toElement(e.target)
      if (target && isOwnUI(target)) return

      e.preventDefault()
      e.stopPropagation()

      // Use the highlighted element (tracked by mousemove) or find the page element
      const el = highlightedElRef.current || getPageElementAt(e.clientX, e.clientY)
      if (!el) {
        console.log(LOG, "click: no element found at", e.clientX, e.clientY)
        return
      }

      console.log(LOG, "click placing at", el.tagName, el.className)
      placeAt(el, e.clientX, e.clientY)
    }

    function handleTouchEnd(e: TouchEvent) {
      if (stateRef.current !== "commenting") return
      const touch = e.changedTouches[0]
      if (!touch) return

      // Let touches on our own UI through
      const target = toElement(e.target)
      if (target && isOwnUI(target)) return

      e.preventDefault()

      const el = getPageElementAt(touch.clientX, touch.clientY)
      if (!el) {
        console.log(LOG, "touch: no element found at", touch.clientX, touch.clientY)
        return
      }

      console.log(LOG, "touch placing at", el.tagName, el.className)
      placeAt(el, touch.clientX, touch.clientY)
    }

    function handleKeyDown(e: KeyboardEvent) {
      // C to toggle commenting mode (only when not typing in an input)
      if (
        e.key === "c" &&
        !e.metaKey && !e.ctrlKey && !e.altKey &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLInputElement)
      ) {
        if (stateRef.current === "idle") {
          startCommenting()
        } else if (stateRef.current === "commenting") {
          cancel()
        }
        return
      }

      if (e.key === "Escape") {
        if (stateRef.current !== "idle") {
          cancel()
        }
      }
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("click", handleClick, true)
    document.addEventListener("touchend", handleTouchEnd, { passive: false })
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("click", handleClick, true)
      document.removeEventListener("touchend", handleTouchEnd)
      document.removeEventListener("keydown", handleKeyDown)
      document.documentElement.removeAttribute("data-cw-placing")
    }
  }, [cancel, placeAt, startCommenting])

  async function handleSubmit(body: string) {
    const positions = cursorPositionsRef.current
    if (!positions) {
      console.log(LOG, "submit: no positions")
      return
    }

    try {
      console.log(LOG, "submitting comment...")
      await createThread({
        body,
        metadata: {
          cursorSelectors: positions.cursorSelectors.join(","),
          cursorX: positions.cursorX,
          cursorY: positions.cursorY,
          zIndex: maxZIndex + 1,
        },
      })
      console.log(LOG, "comment created, returning to idle")
    } catch (err) {
      console.error(LOG, "submit failed:", err)
    }

    cancel()
  }

  // Portal target: render floating UI at #cw-root (or body) to escape the toolbar's
  // transform context. The toolbar has transform: translateX(-50%) which makes it a
  // containing block for position:fixed children, breaking viewport-relative positioning.
  const portalTarget = typeof document !== "undefined"
    ? (document.getElementById("cw-root") ?? document.body)
    : null

  return (
    <>
      {/* Toggle button — comment bubble (idle) vs crosshair (active) */}
      <button
        type="button"
        className={`cw-btn cw-btn-ghost cw-btn-square ${state !== "idle" ? "cw-btn-active cw-btn-commenting" : ""}`}
        onClick={toggle}
        aria-label={state === "idle" ? "Comment (C)" : "Cancel commenting"}
        title="Comment (C)"
      >
        {state !== "idle" ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
            <line x1="8" y1="1" x2="8" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="8" y1="12" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="1" y1="8" x2="4" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="12" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 3C2 2.44772 2.44772 2 3 2H13C13.5523 2 14 2.44772 14 3V10C14 10.5523 13.5523 11 13 11H5L2 14V3Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path d="M5 5.5H11M5 7.5H9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {/* Portal floating UI outside toolbar to avoid transform containing block */}
      {portalTarget && createPortal(
        <>
          {/* Highlight overlay — follows hovered element in commenting mode */}
          {state === "commenting" && highlightRect && (
            <div
              className="cw-highlight-overlay"
              style={{
                top: highlightRect.top,
                left: highlightRect.left,
                width: highlightRect.width,
                height: highlightRect.height,
              }}
            />
          )}

          {/* Floating composer at the pinned position */}
          {state === "composing" && composerCoords && (
            <div
              className="cw-pinned-composer"
              style={{
                position: "fixed",
                top: composerCoords.y,
                left: composerCoords.x,
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
        </>,
        portalTarget,
      )}
    </>
  )
}
