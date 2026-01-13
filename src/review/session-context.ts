// Compress ACP session content into context for AI prompt

import type { SessionNotification } from "@agentclientprotocol/sdk"
import type { CompressedSession, SessionContent } from "./types.ts"

/**
 * Compress a session's notifications into a summary string
 */
export function compressSession(content: SessionContent): CompressedSession {
  const { sessionId, notifications } = content
  const summaryParts: string[] = []
  let title: string | undefined

  for (const notification of notifications) {
    const update = notification.update

    // Extract title from session info updates
    if (update.sessionUpdate === "session_info_update" && update.title) {
      title = update.title
    }

    // Extract user messages
    if (update.sessionUpdate === "user_message_chunk") {
      const content = update.content
      if (content.type === "text") {
        summaryParts.push(`User: ${content.text.slice(0, 200)}...`)
      }
    }

    // Extract assistant messages
    if (update.sessionUpdate === "agent_message_chunk") {
      const content = update.content
      if (content.type === "text" && content.text.trim()) {
        // Only include substantial messages
        if (content.text.length > 50) {
          summaryParts.push(`Assistant: ${content.text.slice(0, 200)}...`)
        }
      }
    }

    // Extract tool calls (most important for understanding what was done)
    if (update.sessionUpdate === "tool_call") {
      const toolName = update.kind || "tool"
      const locations = update.locations || []
      const files = locations.map((l) => l.path).join(", ")

      if (files) {
        summaryParts.push(`Tool [${toolName}]: ${files}`)
      } else {
        summaryParts.push(`Tool [${toolName}]`)
      }
    }

    // Extract plan entries
    if (update.sessionUpdate === "plan") {
      const entries = update.entries || []
      for (const entry of entries) {
        summaryParts.push(`Plan [${entry.status}]: ${entry.content}`)
      }
    }
  }

  // Limit summary length
  const maxSummaryLength = 2000
  let summary = summaryParts.join("\n")
  if (summary.length > maxSummaryLength) {
    summary = summary.slice(0, maxSummaryLength) + "\n... (truncated)"
  }

  return {
    sessionId,
    title,
    summary,
  }
}

/**
 * Convert compressed sessions to XML context for the AI prompt
 */
export function sessionsToContextXml(sessions: CompressedSession[]): string {
  if (sessions.length === 0) {
    return ""
  }

  const lines: string[] = []

  for (const session of sessions) {
    lines.push(`<session id="${session.sessionId}"${session.title ? ` title="${escapeXml(session.title)}"` : ""}>`)
    lines.push(session.summary)
    lines.push("</session>")
    lines.push("")
  }

  return lines.join("\n")
}

/**
 * Escape special XML characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}
