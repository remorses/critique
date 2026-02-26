// Session context compression for including coding session history in AI prompts.
// Extracts key actions (tool calls, messages, thinking) from ACP notifications
// and formats them as XML context to help the AI understand why changes were made.

import type { SessionNotification } from "@agentclientprotocol/sdk"
import type { CompressedSession, SessionContent } from "./types.js"

/**
 * Compress a session's notifications into a summary string
 * Accumulates consecutive chunks (thinking, messages) before adding to summary
 */
export function compressSession(content: SessionContent): CompressedSession {
  const { sessionId, notifications } = content
  const summaryParts: string[] = []
  let title: string | undefined

  // Accumulate consecutive chunks of the same type
  let currentThinking = ""
  let currentMessage = ""
  let currentUserMessage = ""

  const flushThinking = () => {
    if (currentThinking.trim().length > 50) {
      summaryParts.push(`Thinking: ${currentThinking.trim().slice(0, 300)}...`)
    }
    currentThinking = ""
  }

  const flushMessage = () => {
    if (currentMessage.trim().length > 50) {
      summaryParts.push(`Assistant: ${currentMessage.trim().slice(0, 200)}...`)
    }
    currentMessage = ""
  }

  const flushUserMessage = () => {
    if (currentUserMessage.trim()) {
      summaryParts.push(`User: ${currentUserMessage.trim().slice(0, 200)}...`)
    }
    currentUserMessage = ""
  }

  for (const notification of notifications) {
    const update = notification.update

    // Extract title from session info updates
    if (update.sessionUpdate === "session_info_update" && update.title) {
      title = update.title
    }

    // Accumulate user message chunks
    if (update.sessionUpdate === "user_message_chunk") {
      flushThinking()
      flushMessage()
      const content = update.content
      if (content.type === "text") {
        currentUserMessage += content.text
      }
      continue
    }

    // Accumulate assistant message chunks
    if (update.sessionUpdate === "agent_message_chunk") {
      flushThinking()
      flushUserMessage()
      const content = update.content
      if (content.type === "text") {
        currentMessage += content.text
      }
      continue
    }

    // Accumulate thinking chunks - important for understanding reasoning
    if (update.sessionUpdate === "agent_thought_chunk") {
      flushMessage()
      flushUserMessage()
      const content = (update as { content?: { text?: string } }).content
      if (content?.text) {
        currentThinking += content.text
      }
      continue
    }

    // Non-chunk updates: flush accumulated content first
    flushThinking()
    flushMessage()
    flushUserMessage()

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

  // Flush any remaining accumulated content
  flushThinking()
  flushMessage()
  flushUserMessage()

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
