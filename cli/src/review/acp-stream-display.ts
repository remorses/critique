// Formatter for ACP session notifications into displayable stream lines.
// Accumulates consecutive chunks (thinking, messages) and formats tool calls
// with symbols and colors for the streaming display component.

import type { SessionNotification } from "@agentclientprotocol/sdk"

/** Types of displayable stream items */
export type StreamItemType = "thinking" | "message" | "tool_call"

/** A displayable item in the stream */
export interface StreamLine {
  type: StreamItemType
  /** For thinking: ignored. For message: full markdown text. For tool_call: tool title */
  text: string
  /** For tool_call: the tool kind (read, edit, bash, etc) */
  toolKind?: string
  /** For tool_call: file paths involved */
  files?: string[]
  /** For tool_call: additions count */
  additions?: number
  /** For tool_call: deletions count */
  deletions?: number
  /** For tool_call: status */
  status?: string
}

/** Symbols for different event types */
export const SYMBOLS = {
  thinking: "┣",
  toolCall: "┣",
  edit: "◼︎",
  text: "⬥",
} as const

/** Colors for different event types */
export const COLORS = {
  thinking: "#888888",
  toolCall: "#888888",
  edit: "#00ff00",
  text: "#ffffff",
} as const

/**
 * Format notifications into stream lines, accumulating consecutive chunks
 */
export function formatNotifications(notifications: SessionNotification[]): StreamLine[] {
  const lines: StreamLine[] = []
  
  let currentThinkingText = ""
  let currentMessageText = ""
  // Track seen tool call IDs to avoid duplicates from updates
  const seenToolCalls = new Set<string>()
  // Track latest tool call info by ID for updates
  const toolCallInfo = new Map<string, StreamLine>()

  const flushThinking = () => {
    if (currentThinkingText.trim()) {
      lines.push({ type: "thinking", text: currentThinkingText.trim() })
      currentThinkingText = ""
    }
  }

  const flushMessage = () => {
    if (currentMessageText.trim()) {
      lines.push({ type: "message", text: currentMessageText.trim() })
      currentMessageText = ""
    }
  }

  for (const notification of notifications) {
    const update = notification.update

    // Thinking chunks - accumulate
    if (update.sessionUpdate === "agent_thought_chunk") {
      flushMessage() // Flush any pending message
      const content = (update as { content?: { text?: string } }).content
      if (content?.text) {
        currentThinkingText += content.text
      }
      continue
    }

    // Message chunks - accumulate
    if (update.sessionUpdate === "agent_message_chunk") {
      flushThinking() // Flush any pending thinking
      const content = (update as { content?: { text?: string } }).content
      if (content?.text) {
        currentMessageText += content.text
      }
      continue
    }

    // Tool calls - emit immediately
    if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
      flushThinking()
      flushMessage()
      
      const toolUpdate = update as {
        toolCallId?: string
        kind?: string
        title?: string
        locations?: { path: string }[]
        additions?: number
        deletions?: number
        status?: string
      }

      const toolCallId = toolUpdate.toolCallId || ""
      
      // Create or update tool call info
      const existing = toolCallInfo.get(toolCallId)
      const toolLine: StreamLine = {
        type: "tool_call",
        text: toolUpdate.title || toolUpdate.kind || "tool",
        toolKind: toolUpdate.kind || existing?.toolKind,
        files: toolUpdate.locations?.map(l => l.path) || existing?.files || [],
        additions: toolUpdate.additions ?? existing?.additions,
        deletions: toolUpdate.deletions ?? existing?.deletions,
        status: toolUpdate.status || existing?.status,
      }
      
      toolCallInfo.set(toolCallId, toolLine)
      
      // Only add to lines once per tool call
      if (!seenToolCalls.has(toolCallId)) {
        seenToolCalls.add(toolCallId)
        lines.push(toolLine)
      } else {
        // Update the existing line in place
        const idx = lines.findIndex(l => 
          l.type === "tool_call" && 
          l.text === (existing?.text || toolUpdate.title || toolUpdate.kind)
        )
        if (idx !== -1) {
          lines[idx] = toolLine
        }
      }
      continue
    }
  }

  // Flush any remaining content
  flushThinking()
  flushMessage()

  return lines
}

/**
 * Format a stream line for simple text display
 */
export function formatLineToString(line: StreamLine): string {
  if (line.type === "thinking") {
    return `${SYMBOLS.thinking} thinking`
  }
  
  if (line.type === "message") {
    // Show first line only for string output
    const firstLine = line.text.split("\n")[0] || line.text
    const display = firstLine.length > 60 ? firstLine.slice(0, 57) + "..." : firstLine
    return `${SYMBOLS.text} ${display}`
  }
  
  if (line.type === "tool_call") {
    const toolKind = line.toolKind || line.text || ""
    const isEdit = isEditTool(toolKind)
    const isWrite = toolKind.toLowerCase().includes("write")
    const symbol = isEdit ? SYMBOLS.edit : SYMBOLS.toolCall
    
    let text = line.text
    const firstFile = line.files?.[0]
    if (firstFile) {
      const filename = firstFile.split("/").pop() || firstFile
      if (isWrite) {
        text = `write ${filename}`
      } else if (isEdit) {
        text = `edit  ${filename}`
      } else {
        text = `${line.text} ${filename}`
      }
    }
    
    if (isEdit && (line.additions !== undefined || line.deletions !== undefined)) {
      text += ` (+${line.additions || 0}-${line.deletions || 0})`
    }
    
    return `${symbol} ${text}`
  }
  
  return ""
}

/**
 * Format multiple lines to string
 */
export function formatLinesToString(lines: StreamLine[]): string {
  return lines.map(formatLineToString).join("\n")
}

/**
 * Check if a tool is an edit-type tool
 */
export function isEditTool(toolName: string | undefined): boolean {
  if (!toolName) return false
  const lowerName = toolName.toLowerCase()
  return lowerName.includes("edit") || lowerName.includes("write")
}

/**
 * Legacy single notification formatter (for backwards compatibility)
 */
export function formatNotification(notification: SessionNotification): StreamLine[] {
  return formatNotifications([notification])
}
