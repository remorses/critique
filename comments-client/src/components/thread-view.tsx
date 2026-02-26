// ThreadView — renders a single thread with all its comments and a reply composer.
// Used both in pinned overlay and in the sidebar list.

import { useState, useRef } from "react"
import type { Thread, Comment } from "@critique.work/server/types"
import { useComments } from "./provider.js"
import { Composer } from "./composer.js"

export interface ThreadViewProps {
  thread: Thread
  /** Initially loaded comments (loaded on expand) */
  initialComments?: Comment[]
  /** Whether to show the thread in compact mode (just first comment) */
  compact?: boolean
  /** Called when this thread should be focused/scrolled to */
  onFocus?: () => void
}

export function ThreadView({ thread, compact = false, onFocus }: ThreadViewProps) {
  const { addComment, resolveThread, deleteThread, getThreadComments, userId } = useComments()
  const [comments, setComments] = useState<Comment[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const loadedRef = useRef(false)

  async function handleExpand() {
    if (!loadedRef.current) {
      setLoading(true)
      try {
        const loaded = await getThreadComments(thread.id)
        setComments(loaded)
        loadedRef.current = true
      } finally {
        setLoading(false)
      }
    }
    setExpanded(true)
    onFocus?.()
  }

  async function handleReply(body: string) {
    const comment = await addComment({ threadId: thread.id, body })
    setComments((prev) => [...prev, comment])
  }

  function handleResolve() {
    resolveThread(thread.id)
  }

  function handleDelete() {
    deleteThread(thread.id)
  }

  const timeAgo = formatTimeAgo(thread.createdAt)

  return (
    <div
      className={`cw-thread ${thread.resolved ? "cw-thread-resolved" : ""}`}
      data-thread-id={thread.id}
    >
      {/* Thread header */}
      <div className="cw-thread-header">
        <div className="cw-thread-avatar">{getInitials(thread.firstComment?.userName || thread.createdBy)}</div>
        <div className="cw-thread-meta">
          <span className="cw-thread-author">{thread.firstComment?.userName || "Anonymous"}</span>
          <span className="cw-thread-time">{timeAgo}</span>
        </div>
        <div className="cw-thread-actions">
          <button
            className="cw-thread-action"
            onClick={handleResolve}
            aria-label={thread.resolved ? "Unresolve" : "Resolve"}
            title={thread.resolved ? "Unresolve" : "Resolve"}
          >
            {thread.resolved ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5 8L7 10L11 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            )}
          </button>
          {thread.createdBy === userId && (
            <button className="cw-thread-action" onClick={handleDelete} aria-label="Delete" title="Delete">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* First comment (always visible) */}
      <div className="cw-thread-body">
        {thread.firstComment?.body || ""}
      </div>

      {/* Expand/collapse for replies */}
      {thread.commentCount > 1 && !expanded && (
        <button className="cw-thread-expand" onClick={handleExpand}>
          {loading ? "Loading..." : `${thread.commentCount - 1} ${thread.commentCount - 1 === 1 ? "reply" : "replies"}`}
        </button>
      )}

      {/* All comments when expanded */}
      {expanded && comments.length > 0 && (
        <div className="cw-thread-comments">
          {comments.map((comment) => (
            <div key={comment.id} className="cw-comment">
              <div className="cw-comment-header">
                <div className="cw-comment-avatar">{getInitials(comment.userName || comment.createdBy)}</div>
                <span className="cw-comment-author">{comment.userName || "Anonymous"}</span>
                <span className="cw-comment-time">{formatTimeAgo(comment.createdAt)}</span>
              </div>
              <div className="cw-comment-body">{comment.body}</div>
            </div>
          ))}
        </div>
      )}

      {/* Reply composer */}
      {expanded && (
        <div className="cw-thread-reply">
          <Composer onSubmit={handleReply} placeholder="Reply..." />
        </div>
      )}
    </div>
  )
}

function getInitials(name: string): string {
  if (name.length <= 2) return name.toUpperCase()
  const parts = name.split(/[\s-_]+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

function formatTimeAgo(isoDate: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(isoDate).toLocaleDateString()
}
