// CommentsToolbar — fixed bottom bar (Liveblocks-style).
// Contains: + new thread button, comment count badge, sidebar toggle.
// The toolbar is the owner of the sidebar open/close state.

import { useState } from "react"
import { useComments } from "./provider.js"
import { NewThread } from "./new-thread.js"
import { CommentsSidebar } from "./sidebar.js"

export function CommentsToolbar() {
  const { threads, connected } = useComments()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const unresolvedCount = threads.filter((t) => !t.resolved).length
  const resolvedCount = threads.filter((t) => t.resolved).length

  return (
    <>
      {/* Bottom bar */}
      <div className="cw-toolbar">
        {/* Connection indicator */}
        <div className={`cw-toolbar-dot ${connected ? "cw-toolbar-dot-connected" : ""}`} />

        {/* New thread button */}
        <div className="cw-toolbar-actions">
          <NewThread />
        </div>

        <div className="cw-toolbar-separator" />

        {/* Comment count */}
        <div className="cw-toolbar-count">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 3C2 2.44772 2.44772 2 3 2H13C13.5523 2 14 2.44772 14 3V10C14 10.5523 13.5523 11 13 11H5L2 14V3Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          <span>{unresolvedCount}</span>
        </div>

        <div className="cw-toolbar-separator" />

        {/* Sidebar toggle */}
        <div className="cw-toolbar-actions">
          <button
            className={`cw-btn cw-btn-ghost cw-btn-square ${sidebarOpen ? "cw-btn-active" : ""}`}
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            title="All comments"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <line x1="6" y1="2.5" x2="6" y2="13.5" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Sidebar panel */}
      {sidebarOpen && (
        <CommentsSidebar onClose={() => setSidebarOpen(false)} />
      )}
    </>
  )
}
