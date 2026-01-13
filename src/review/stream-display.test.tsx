// Tests for StreamDisplay component

import { afterEach, describe, expect, it } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import type { SessionNotification } from "@agentclientprotocol/sdk"
import { StreamDisplay } from "./stream-display.tsx"

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

describe("StreamDisplay", () => {
  let testSetup: Awaited<ReturnType<typeof testRender>>

  afterEach(() => {
    if (testSetup) {
      testSetup.renderer.destroy()
    }
  })

  it("should show waiting message when no notifications", async () => {
    testSetup = await testRender(
      <StreamDisplay notifications={[]} themeName="github" width={60} />,
      { width: 60, height: 5 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
      "Waiting for agent...                                        
                                                                  
                                                                  
                                                                  
                                                                  
      "
    `)
  })

  it("should render accumulated thinking as single line", async () => {
    const notifications = [
      createNotification({
        sessionUpdate: "agent_thought_chunk",
        content: { text: "Let me ", type: "text" },
      }),
      createNotification({
        sessionUpdate: "agent_thought_chunk",
        content: { text: "analyze...", type: "text" },
      }),
    ]

    testSetup = await testRender(
      <StreamDisplay notifications={notifications} themeName="github" width={60} />,
      { width: 60, height: 5 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
      "┣ thinking                                                  
                                                                  
                                                                  
                                                                 █
                                                                  
      "
    `)
  })

  it("should render accumulated message with full content", async () => {
    const notifications = [
      createNotification({
        sessionUpdate: "agent_message_chunk",
        content: { text: "**Hello** ", type: "text" },
      }),
      createNotification({
        sessionUpdate: "agent_message_chunk",
        content: { text: "world!", type: "text" },
      }),
    ]

    testSetup = await testRender(
      <StreamDisplay notifications={notifications} themeName="github" width={60} />,
      { width: 60, height: 5 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
      "⬥                                                           
        **Hello** world!                                          
                                                                  
                                                                 █
                                                                  
      "
    `)
  })

  it("should render tool call", async () => {
    const notifications = [
      createNotification({
        sessionUpdate: "tool_call",
        toolCallId: "tool-1",
        kind: "read",
        title: "read",
        locations: [{ path: "/path/to/file.ts" }],
      }),
    ]

    testSetup = await testRender(
      <StreamDisplay notifications={notifications} themeName="github" width={60} />,
      { width: 60, height: 5 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
      "┣ read file.ts                                              
                                                                  
                                                                  
                                                                 █
                                                                  
      "
    `)
  })

  it("should render edit tool with square symbol", async () => {
    const notifications = [
      createNotification({
        sessionUpdate: "tool_call",
        toolCallId: "tool-1",
        kind: "mcp_edit",
        title: "Edit",
        locations: [{ path: "/path/to/file.yaml" }],
        additions: 40,
        deletions: 35,
      }),
    ]

    testSetup = await testRender(
      <StreamDisplay notifications={notifications} themeName="github" width={60} />,
      { width: 60, height: 5 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
      "◼︎ edit  file.yaml (+40-35)                                  
                                                                  
                                                                  
                                                                 █
                                                                  
      "
    `)
  })

  it("should render simple response fixture", async () => {
    testSetup = await testRender(
      <StreamDisplay 
        notifications={simpleResponse as SessionNotification[]} 
        themeName="github" 
        width={60} 
      />,
      { width: 60, height: 10 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
      "┣ thinking                                                  
      ⬥                                                           
        Hello! I'm ready to help you review code.                 
                                                                  
                                                                  
                                                                 █
                                                                 █
                                                                 ▀
                                                                  
                                                                  
      "
    `)
  })

  it("should render tool call fixture with full sequence", async () => {
    testSetup = await testRender(
      <StreamDisplay 
        notifications={toolCallResponse as SessionNotification[]} 
        themeName="github" 
        width={60} 
      />,
      { width: 60, height: 15 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
      "┣ thinking                                                  
      ┣ package.json                                              
      ┣ thinking                                                  
      ⬥                                                           
        **Name:** \`critique\`                                      
        **Version:** \`0.1.14\`                                     
                                                                  
                                                                  
                                                                 █
                                                                 █
                                                                 █
                                                                 ▀
                                                                  
                                                                  
                                                                  
      "
    `)
  })
})
