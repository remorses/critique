// CommentsOverlay — renders all pinned thread bubbles on the page.
// Each thread is positioned using the CSS-selector coordinate system.
// Supports drag-to-reposition and click-to-expand.

import { useState, useRef, useCallback, useEffect } from "react"
import { useComments } from "./provider.js"
import {
  getCoordsFromAccurateCursorPositions,
  getCoordsFromElement,
  getElementBeneath,
  type PageCoords,
} from "../lib/coords.js"
import { useMaxZIndex } from "../hooks/use-max-z-index.js"
import { ThreadView } from "./thread-view.js"
import type { Thread } from "@critique.work/server/types"

export function CommentsOverlay() {
  const { threads } = useComments()
  const maxZIndex = useMaxZIndex(threads)

  const unresolvedThreads = threads.filter((t) => !t.resolved)

  return (
    <div className="cw-overlay" style={{ pointerEvents: "none" }}>
      {unresolvedThreads.map((thread) => (
        <OverlayThread key={thread.id} thread={thread} maxZIndex={maxZIndex} />
      ))}
    </div>
  )
}

interface OverlayThreadProps {
  thread: Thread
  maxZIndex: number
}

function OverlayThread({ thread, maxZIndex }: OverlayThreadProps) {
  const { updateThreadMetadata } = useComments()
  const threadRef = useRef<HTMLDivElement>(null)

  const [coords, setCoords] = useState<PageCoords>({ x: -10000, y: -10000 })
  const [expanded, setExpanded] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  // Resolve selectors to pixel coords
  const resolveCoords = useCallback(() => {
    const selectors = thread.metadata.cursorSelectors.split(",")
    const resolved = getCoordsFromAccurateCursorPositions({
      cursorSelectors: selectors,
      cursorX: thread.metadata.cursorX,
      cursorY: thread.metadata.cursorY,
    })
    if (resolved) {
      setCoords(resolved)
    }
  }, [thread.metadata])

  // Resolve on mount, on metadata change, and on resize/scroll
  useEffect(() => {
    resolveCoords()
    const handler = () => resolveCoords()
    window.addEventListener("resize", handler)
    window.addEventListener("scroll", handler, true)
    return () => {
      window.removeEventListener("resize", handler)
      window.removeEventListener("scroll", handler, true)
    }
  }, [resolveCoords])

  // Drag handlers
  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()

    const el = threadRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }

    setDragging(true)
    el.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging) return
    setCoords({
      x: e.pageX - dragOffsetRef.current.x,
      y: e.pageY - dragOffsetRef.current.y,
    })
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!dragging) return
    setDragging(false)

    const el = threadRef.current
    if (!el) return

    el.releasePointerCapture(e.pointerId)

    // Find element beneath the drop point and re-anchor
    const beneath = getElementBeneath(el, e.clientX, e.clientY)
    if (beneath) {
      const positions = getCoordsFromElement(
        beneath,
        e.clientX,
        e.clientY,
        dragOffsetRef.current,
      )
      if (positions) {
        updateThreadMetadata({
          threadId: thread.id,
          metadata: {
            cursorSelectors: positions.cursorSelectors.join(","),
            cursorX: positions.cursorX,
            cursorY: positions.cursorY,
            zIndex: maxZIndex + 1,
          },
        })
      }
    }
  }

  function handleClick(e: React.MouseEvent) {
    // Only toggle if it wasn't a drag
    if (!dragging) {
      e.stopPropagation()
      setExpanded((prev) => !prev)
    }
  }

  return (
    <div
      ref={threadRef}
      className="cw-overlay-thread"
      style={{
        transform: `translate(${coords.x}px, ${coords.y}px)`,
        zIndex: dragging ? 9999999 : thread.metadata.zIndex,
        pointerEvents: "all",
      }}
    >
      {/* Pin avatar */}
      <div
        className="cw-pin-avatar"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={handleClick}
      >
        {getInitials(thread.firstComment?.userName || thread.createdBy)}
      </div>

      {/* Expanded thread view */}
      {expanded && (
        <div className="cw-overlay-thread-content">
          <ThreadView thread={thread} />
        </div>
      )}
    </div>
  )
}

function getInitials(name: string): string {
  if (!name) return "?"
  if (name.length <= 2) return name.toUpperCase()
  const parts = name.split(/[\s-_]+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}
