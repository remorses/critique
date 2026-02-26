// Hook to detect if an element is near the edge of the viewport.
// Used to flip comment popups when they would overflow off-screen.

import { useState, useCallback, type RefObject } from "react"

export interface EdgeState {
  flipHorizontal: boolean
  flipVertical: boolean
}

const EDGE_THRESHOLD_X = 400
const EDGE_THRESHOLD_Y_RATIO = 0.5

export function useNearEdge(ref: RefObject<HTMLElement | null>): EdgeState {
  const [state, setState] = useState<EdgeState>({
    flipHorizontal: false,
    flipVertical: false,
  })

  // Call this whenever the element position changes
  const update = useCallback(() => {
    const el = ref.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    setState({
      flipHorizontal: rect.left > viewportWidth - EDGE_THRESHOLD_X,
      flipVertical: rect.top > viewportHeight * EDGE_THRESHOLD_Y_RATIO,
    })
  }, [ref])

  // We call update lazily from the component when coords change
  // rather than using a ResizeObserver to avoid unnecessary re-renders
  return { ...state, update } as EdgeState & { update: () => void }
}
