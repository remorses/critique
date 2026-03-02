// Tests for session context compression
// Uses real captured ACP events from fixtures/

import { describe, it, expect } from "bun:test"
import { compressSession, sessionsToContextXml } from "./session-context.js"
import type { SessionContent } from "./types.js"
import type { SessionNotification } from "@agentclientprotocol/sdk"

import simpleResponse from "./fixtures/simple-response.json"
import toolCallResponse from "./fixtures/tool-call-response.json"

describe("compressSession", () => {
  it("compresses simple response with thinking and message", () => {
    const content: SessionContent = {
      sessionId: "test-simple",
      notifications: simpleResponse as SessionNotification[],
    }

    const result = compressSession(content)
    expect(result).toMatchInlineSnapshot(`
      {
        "sessionId": "test-simple",
        "summary": "Thinking: The user wants me to say a specific greeting and nothing else....",
        "title": undefined,
      }
    `)
  })

  it("compresses tool call response with thinking, tool calls, and messages", () => {
    const content: SessionContent = {
      sessionId: "test-tool-call",
      notifications: toolCallResponse as SessionNotification[],
    }

    const result = compressSession(content)
    expect(result).toMatchInlineSnapshot(`
      {
        "sessionId": "test-tool-call",
        "summary": 
      "Thinking: The user wants me to read the package.json file to get the name and version. Let me do that....
      Tool [read]
      Thinking: The user wants the name and version from package.json. I can see:
      - name: "critique"
      - version: "0.1.14"..."
      ,
        "title": undefined,
      }
    `)
  })

  it("handles empty notifications", () => {
    const content: SessionContent = {
      sessionId: "empty",
      notifications: [],
    }

    const result = compressSession(content)
    expect(result).toMatchInlineSnapshot(`
      {
        "sessionId": "empty",
        "summary": "",
        "title": undefined,
      }
    `)
  })

  it("truncates very long summaries", () => {
    // Create many copies of the fixture to exceed 2000 chars
    const manyNotifications = Array.from({ length: 20 }, () => toolCallResponse).flat()
    const content: SessionContent = {
      sessionId: "long",
      notifications: manyNotifications as SessionNotification[],
    }

    const result = compressSession(content)
    expect(result.summary.length).toBeLessThanOrEqual(2020)
    expect(result.summary.endsWith("... (truncated)")).toBe(true)
  })
})

describe("sessionsToContextXml", () => {
  it("returns empty string for no sessions", () => {
    expect(sessionsToContextXml([])).toMatchInlineSnapshot(`""`)
  })

  it("formats compressed session to XML", () => {
    const content: SessionContent = {
      sessionId: "ses_test123",
      notifications: toolCallResponse as SessionNotification[],
    }

    const compressed = compressSession(content)
    expect(sessionsToContextXml([compressed])).toMatchInlineSnapshot(`
      "<session id="ses_test123">
      Thinking: The user wants me to read the package.json file to get the name and version. Let me do that....
      Tool [read]
      Thinking: The user wants the name and version from package.json. I can see:
      - name: "critique"
      - version: "0.1.14"...
      </session>
      "
    `)
  })

  it("formats session with title", () => {
    const result = sessionsToContextXml([
      {
        sessionId: "abc-123",
        title: "Bug fix session",
        summary: "Tool [edit]: src/file.ts",
      },
    ])
    expect(result).toMatchInlineSnapshot(`
      "<session id="abc-123" title="Bug fix session">
      Tool [edit]: src/file.ts
      </session>
      "
    `)
  })

  it("escapes XML special characters in title", () => {
    const result = sessionsToContextXml([
      {
        sessionId: "abc-123",
        title: 'Fix <script> & "quotes"',
        summary: "content",
      },
    ])
    expect(result).toMatchInlineSnapshot(`
      "<session id="abc-123" title="Fix &lt;script&gt; &amp; &quot;quotes&quot;">
      content
      </session>
      "
    `)
  })

  it("formats multiple sessions", () => {
    const content1: SessionContent = {
      sessionId: "session-1",
      notifications: simpleResponse as SessionNotification[],
    }
    const content2: SessionContent = {
      sessionId: "session-2",
      notifications: toolCallResponse as SessionNotification[],
    }

    const result = sessionsToContextXml([
      compressSession(content1),
      compressSession(content2),
    ])
    expect(result).toMatchInlineSnapshot(`
      "<session id="session-1">
      Thinking: The user wants me to say a specific greeting and nothing else....
      </session>

      <session id="session-2">
      Thinking: The user wants me to read the package.json file to get the name and version. Let me do that....
      Tool [read]
      Thinking: The user wants the name and version from package.json. I can see:
      - name: "critique"
      - version: "0.1.14"...
      </session>
      "
    `)
  })
})
