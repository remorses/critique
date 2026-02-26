#!/usr/bin/env bun
// Script to capture ACP events from an opencode session and save to JSON
// Usage: bun run scripts/capture-acp-events.ts [output-file]

import {
  ClientSideConnection,
  ndJsonStream,
  type SessionNotification,
} from "@agentclientprotocol/sdk"
import fs from "fs"

const outputFile = process.argv[2] || "acp-events.json"
const events: SessionNotification[] = []

console.log("Spawning opencode ACP server...")

const proc = Bun.spawn([ "opencode", "acp"], {
  stdin: "pipe",
  stdout: "pipe",
  stderr: "inherit",
})

const procStdin = proc.stdin
const procStdout = proc.stdout

if (!procStdin || !procStdout) {
  throw new Error("Failed to create stdin/stdout pipes")
}

const stdin = new WritableStream<Uint8Array>({
  write: (chunk) => {
    if (typeof procStdin !== "number" && "write" in procStdin) {
      procStdin.write(chunk)
    }
  },
})

const stdout = procStdout as ReadableStream<Uint8Array>
const stream = ndJsonStream(stdin, stdout)

const client = new ClientSideConnection(
  () => ({
    async sessionUpdate(params: SessionNotification) {
      events.push(params)
      // Log event type for visibility
      const update = params.update
      console.log(`[${events.length}] ${update.sessionUpdate}`)
    },
    async requestPermission(params) {
      console.log("Permission requested:", params.toolCall?.title)
      const allowOption = params.options?.find(
        (o) => o.kind === "allow_once" || o.kind === "allow_always",
      )
      if (allowOption) {
        return {
          outcome: { outcome: "selected" as const, optionId: allowOption.optionId },
        }
      }
      return { outcome: { outcome: "cancelled" as const } }
    },
  }),
  stream,
)

console.log("Initializing ACP connection...")
await client.initialize({
  protocolVersion: 1,
  clientCapabilities: {},
})
console.log("Connected!")

const cwd = process.cwd()

// Create new session
console.log("Creating new session...")
const { sessionId } = await client.newSession({
  cwd,
  mcpServers: [],
})
console.log(`Session created: ${sessionId}`)

// Send a prompt - can be customized via env var
const prompt = process.env.ACP_PROMPT || `Say "Hello! I'm ready to help you review code." and nothing else.`

console.log("Sending prompt...")
console.log("---")

try {
  await client.prompt({
    sessionId,
    prompt: [{ type: "text", text: prompt }],
  })
} catch (error) {
  console.error("Prompt error:", error)
}

console.log("---")
console.log(`Captured ${events.length} events`)

// Save to file
fs.writeFileSync(outputFile, JSON.stringify(events, null, 2))
console.log(`Saved to ${outputFile}`)

// Cleanup
proc.kill()
process.exit(0)
