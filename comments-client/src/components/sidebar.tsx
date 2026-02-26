// CommentsSidebar — right-side panel listing all threads.
// Unresolved threads appear first; resolved threads are faded.
// Matches the Liveblocks sidebar pattern with fixed positioning.

import { useMemo } from "react"
import { useComments } from "./provider.js"
import { ThreadView } from "./thread-view.js"

export interface CommentsSidebarProps {
  onClose: () => void
}

export function CommentsSidebar({ onClose }: CommentsSidebarProps) {
  const { threads } = useComments()

  const sortedThreads = useMemo(() => {
    return [...threads].sort((a, b) => {
      // Unresolved first
      if (a.resolved && !b.resolved) return 1
      if (!a.resolved && b.resolved) return -1
      // Then by creation date, newest first
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [threads])

  const resolvedCount = threads.filter((t) => t.resolved).length
  const totalCount = threads.length

  return (
    <div className="cw-sidebar-wrapper">
      <div className="cw-sidebar" data-state="open">
        {/* Header */}
        <div className="cw-sidebar-header">
          <div className="cw-sidebar-resolved">
            {resolvedCount === totalCount && totalCount > 0 ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5 8L7 10L11 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2 3C2 2.44772 2.44772 2 3 2H13C13.5523 2 14 2.44772 14 3V10C14 10.5523 13.5523 11 13 11H5L2 14V3Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            <span>
              {resolvedCount}/{totalCount} resolved
            </span>
          </div>
          <button className="cw-sidebar-close" onClick={onClose} aria-label="Close sidebar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Thread list */}
        <div className="cw-sidebar-threads">
          {sortedThreads.length === 0 ? (
            <div className="cw-sidebar-empty">
              <p>No comments yet.</p>
              <p>Click the + button to add one.</p>
            </div>
          ) : (
            sortedThreads.map((thread) => (
              <div
                key={thread.id}
                className={`cw-sidebar-thread ${thread.resolved ? "cw-sidebar-thread-resolved" : ""}`}
              >
                <ThreadView thread={thread} compact />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
