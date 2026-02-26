// Hook to derive the maximum zIndex across all threads.
// Used to bring the most recently interacted thread to the front.

import { useMemo } from "react"
import type { Thread } from "@critique.work/server/types"

export function useMaxZIndex(threads: Thread[]): number {
  return useMemo(() => {
    let max = 0
    for (const thread of threads) {
      if (thread.metadata.zIndex > max) {
        max = thread.metadata.zIndex
      }
    }
    return max
  }, [threads])
}
