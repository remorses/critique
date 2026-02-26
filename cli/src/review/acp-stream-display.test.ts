// Tests for ACP stream display formatting
// @ts-nocheck - Test assertions use array access after length checks

import { describe, it, expect } from "bun:test"
import type { SessionNotification } from "@agentclientprotocol/sdk"
import {
  formatNotification,
  formatNotifications,
  formatLinesToString,
  type StreamLine,
} from "./acp-stream-display.js"

// Load realistic fixture data
import simpleResponse from "./fixtures/simple-response.json"
import toolCallResponse from "./fixtures/tool-call-response.json"

// Helper to create mock notifications
function createNotification(
  update: Record<string, unknown>,
): SessionNotification {
  return {
    sessionId: "test-session",
    update: update as SessionNotification["update"],
  }
}

describe("formatNotifications", () => {
  it("accumulates consecutive thought chunks into single thinking block", () => {
    const notifications = [
      createNotification({
        sessionUpdate: "agent_thought_chunk",
        content: { text: "The user wants", type: "text" },
      }),
      createNotification({
        sessionUpdate: "agent_thought_chunk",
        content: { text: " me to read", type: "text" },
      }),
      createNotification({
        sessionUpdate: "agent_thought_chunk",
        content: { text: " the file.", type: "text" },
      }),
    ]

    const lines = formatNotifications(notifications)
    expect(lines).toHaveLength(1)
    expect(lines[0].type).toBe("thinking")
    expect(lines[0].text).toBe("The user wants me to read the file.")
  })

  it("accumulates consecutive message chunks into single message block", () => {
    const notifications = [
      createNotification({
        sessionUpdate: "agent_message_chunk",
        content: { text: "**Name:** `", type: "text" },
      }),
      createNotification({
        sessionUpdate: "agent_message_chunk",
        content: { text: "critique`  ", type: "text" },
      }),
      createNotification({
        sessionUpdate: "agent_message_chunk",
        content: { text: "\n**Version:** `0.1.14`", type: "text" },
      }),
    ]

    const lines = formatNotifications(notifications)
    expect(lines).toHaveLength(1)
    expect(lines[0].type).toBe("message")
    expect(lines[0].text).toBe("**Name:** `critique`  \n**Version:** `0.1.14`")
  })

  it("separates thinking and message blocks", () => {
    const notifications = [
      createNotification({
        sessionUpdate: "agent_thought_chunk",
        content: { text: "Let me think...", type: "text" },
      }),
      createNotification({
        sessionUpdate: "agent_message_chunk",
        content: { text: "Here is my response", type: "text" },
      }),
    ]

    const lines = formatNotifications(notifications)
    expect(lines).toHaveLength(2)
    expect(lines[0].type).toBe("thinking")
    expect(lines[1].type).toBe("message")
  })

  it("handles tool calls between chunks", () => {
    const notifications = [
      createNotification({
        sessionUpdate: "agent_thought_chunk",
        content: { text: "I need to read the file", type: "text" },
      }),
      createNotification({
        sessionUpdate: "tool_call",
        toolCallId: "tool-1",
        kind: "read",
        title: "read",
        status: "pending",
      }),
      createNotification({
        sessionUpdate: "tool_call_update",
        toolCallId: "tool-1",
        kind: "read",
        title: "package.json",
        locations: [{ path: "/path/to/package.json" }],
        status: "completed",
      }),
      createNotification({
        sessionUpdate: "agent_message_chunk",
        content: { text: "The name is critique", type: "text" },
      }),
    ]

    const lines = formatNotifications(notifications)
    expect(lines).toHaveLength(3)
    expect(lines[0].type).toBe("thinking")
    expect(lines[1].type).toBe("tool_call")
    expect(lines[1].text).toBe("package.json")
    expect(lines[1].files).toEqual(["/path/to/package.json"])
    expect(lines[2].type).toBe("message")
  })

  it("handles simple response fixture", () => {
    const lines = formatNotifications(simpleResponse as SessionNotification[])
    
    // Should have: thinking block, message block
    // (available_commands_update is ignored)
    expect(lines.length).toBeGreaterThanOrEqual(2)
    
    const thinking = lines.find(l => l.type === "thinking")
    expect(thinking).toBeDefined()
    if (thinking) expect(thinking.text).toContain("specific greeting")

    const message = lines.find(l => l.type === "message")
    expect(message).toBeDefined()
    if (message) expect(message.text).toContain("Hello!")
  })

  it("handles tool call response fixture", () => {
    const lines = formatNotifications(toolCallResponse as SessionNotification[])
    
    // Should have: thinking, tool_call, thinking, message
    const types = lines.map(l => l.type)
    expect(types).toContain("thinking")
    expect(types).toContain("tool_call")
    expect(types).toContain("message")

    const toolCall = lines.find(l => l.type === "tool_call")
    expect(toolCall).toBeDefined()
    if (toolCall) expect(toolCall.toolKind).toBe("read")

    const message = lines.find(l => l.type === "message")
    expect(message).toBeDefined()
    if (message) {
      expect(message.text).toContain("critique")
      expect(message.text).toContain("0.1.14")
    }
  })
})

describe("formatLinesToString", () => {
  it("formats thinking as ┣ thinking", () => {
    const lines: StreamLine[] = [{ type: "thinking", text: "some thinking" }]
    expect(formatLinesToString(lines)).toBe("┣ thinking")
  })

  it("formats message with diamond symbol", () => {
    const lines: StreamLine[] = [{ type: "message", text: "Hello world" }]
    expect(formatLinesToString(lines)).toBe("⬥ Hello world")
  })

  it("truncates long message first lines", () => {
    const lines: StreamLine[] = [{ 
      type: "message", 
      text: "This is a very long message that should be truncated because it exceeds sixty characters on the first line" 
    }]
    expect(formatLinesToString(lines)).toMatchInlineSnapshot(
      `"⬥ This is a very long message that should be truncated beca..."`,
    )
  })

  it("formats tool call with file", () => {
    const lines: StreamLine[] = [{
      type: "tool_call",
      text: "read",
      toolKind: "read",
      files: ["/path/to/file.ts"],
    }]
    expect(formatLinesToString(lines)).toBe("┣ read file.ts")
  })

  it("formats edit tool with square symbol and changes", () => {
    const lines: StreamLine[] = [{
      type: "tool_call",
      text: "Edit",
      toolKind: "mcp_edit",
      files: ["/path/to/file.yaml"],
      additions: 40,
      deletions: 35,
    }]
    expect(formatLinesToString(lines)).toBe("◼︎ edit  file.yaml (+40-35)")
  })

  it("formats write tool with square symbol and changes", () => {
    const lines: StreamLine[] = [{
      type: "tool_call",
      text: "Write",
      toolKind: "mcp_write",
      files: ["/path/to/newfile.ts"],
      additions: 50,
      deletions: 0,
    }]
    expect(formatLinesToString(lines)).toBe("◼︎ write newfile.ts (+50-0)")
  })

  it("formats full sequence from fixture", () => {
    const lines = formatNotifications(toolCallResponse as SessionNotification[])
    const output = formatLinesToString(lines)
    
    expect(output).toContain("┣ thinking")
    expect(output).toContain("┣ ")  // tool call
    expect(output).toContain("⬥")   // message
  })
})

describe("formatNotification (legacy)", () => {
  it("works for single notification", () => {
    const notification = createNotification({
      sessionUpdate: "agent_thought_chunk",
      content: { text: "thinking", type: "text" },
    })
    const lines = formatNotification(notification)
    expect(lines).toHaveLength(1)
    const first = lines[0]
    if (first) expect(first.type).toBe("thinking")
  })
})
