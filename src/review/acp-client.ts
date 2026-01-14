// ACP client for connecting to AI agents (opencode or claude)

import {
  ClientSideConnection,
  ndJsonStream,
  type SessionNotification,
  type SessionInfo as AcpSessionInfo,
} from "@agentclientprotocol/sdk"
import type { SessionInfo, SessionContent } from "./types.ts"
import { logger } from "../logger.ts"
import fs from "fs"
import path from "path"
import os from "os"

export type AgentType = "opencode" | "claude"

/**
 * Client for communicating with AI agents via ACP protocol
 * Supports both OpenCode and Claude Code
 */
export class AcpClient {
  private proc: ReturnType<typeof Bun.spawn> | null = null
  private client: ClientSideConnection | null = null
  private sessionUpdates: Map<string, SessionNotification[]> = new Map()
  private onUpdateCallback: ((notification: SessionNotification) => void) | null = null
  private agent: AgentType

  constructor(agent: AgentType = "opencode") {
    this.agent = agent
    this.connect = this.connect.bind(this)
    this.listSessions = this.listSessions.bind(this)
    this.loadSessionContent = this.loadSessionContent.bind(this)
    this.createReviewSession = this.createReviewSession.bind(this)
    this.close = this.close.bind(this)
  }

  /**
   * Spawn ACP server and establish connection
   * @param onUpdate - Optional callback for session update notifications
   */
  async connect(onUpdate?: (notification: SessionNotification) => void): Promise<void> {
    this.onUpdateCallback = onUpdate || null
    logger.info(`Spawning ${this.agent} ACP server...`)

    // Spawn the appropriate ACP server
    const command = this.agent === "opencode"
      ? ["bunx", "opencode", "acp"]
      : ["bunx", "@zed-industries/claude-code-acp"]

    this.proc = Bun.spawn(command, {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "inherit",
    })

    const procStdin = this.proc.stdin
    const procStdout = this.proc.stdout

    if (!procStdin || !procStdout) {
      throw new Error("Failed to create stdin/stdout pipes")
    }

    // Create writable stream adapter for Bun
    const stdin = new WritableStream<Uint8Array>({
      write: (chunk) => {
        if (typeof procStdin !== "number" && "write" in procStdin) {
          procStdin.write(chunk)
        }
      },
    })

    // Create readable stream from Bun stdout
    const stdout = procStdout as ReadableStream<Uint8Array>

    // Create the ndjson stream for ACP communication
    const stream = ndJsonStream(stdin, stdout)

    // Bind sessionUpdates and onUpdateCallback to use in the handler
    const sessionUpdates = this.sessionUpdates
    const onUpdateCallback = this.onUpdateCallback
    this.client = new ClientSideConnection(
      () => ({
        async sessionUpdate(params: SessionNotification) {
          const updates = sessionUpdates.get(params.sessionId) || []
          updates.push(params)
          sessionUpdates.set(params.sessionId, updates)
          // Call the update callback if provided
          if (onUpdateCallback) {
            onUpdateCallback(params)
          }
        },
        async requestPermission(params) {
          // Auto-approve all tool calls for review mode
          // The AI needs to write to temp files for YAML output
          logger.info("Permission requested", {
            tool: params.toolCall?.title,
            options: params.options?.map(o => ({ id: o.optionId, kind: o.kind }))
          })

          // Find an "allow" option from the provided options
          const allowOption = params.options?.find(
            o => o.kind === "allow_once" || o.kind === "allow_always"
          )

          if (allowOption) {
            logger.info("Auto-approving with option", { optionId: allowOption.optionId })
            return {
              outcome: {
                outcome: "selected" as const,
                optionId: allowOption.optionId
              }
            }
          }

          // If no allow option found, cancel (shouldn't happen)
          logger.warn("No allow option found, cancelling")
          return { outcome: { outcome: "cancelled" as const } }
        },
      }),
      stream,
    )

    // Initialize the connection
    logger.info("Initializing ACP connection...")
    await this.client.initialize({
      protocolVersion: 1,
      clientCapabilities: {},
    })
    logger.info("ACP connection established")
  }

  /**
   * List sessions for the given working directory
   * Uses CLI command for opencode, parses JSONL files for claude
   */
  async listSessions(cwd: string): Promise<SessionInfo[]> {
    if (this.agent === "opencode") {
      return this.listOpencodeSessions(cwd)
    } else {
      return this.listClaudeSessions(cwd)
    }
  }

  /**
   * List OpenCode sessions using CLI command
   */
  private async listOpencodeSessions(cwd: string): Promise<SessionInfo[]> {
    const result = Bun.spawnSync(["opencode", "session", "list", "--format", "json"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    })

    if (result.exitCode !== 0) {
      return []
    }

    try {
      const sessions = JSON.parse(result.stdout.toString()) as Array<{
        id: string
        title: string
        updated: number
        created: number
        projectId: string
        directory: string
        _meta?: { [key: string]: unknown } | null
      }>

      // Filter sessions to only those matching the cwd
      return sessions
        .filter((s) => s.directory === cwd)
        .map((s) => ({
          sessionId: s.id,
          cwd: s.directory,
          title: s.title || undefined,
          updatedAt: s.updated,
          _meta: s._meta,
        }))
    } catch (e) {
      logger.debug("Failed to parse opencode sessions", { error: e })
      return []
    }
  }

  /**
   * List Claude Code sessions by parsing JSONL files
   * Sessions are stored in ~/.claude/projects/<path-encoded>/
   */
  private async listClaudeSessions(cwd: string): Promise<SessionInfo[]> {
    // Claude stores sessions in ~/.claude/projects/ with path encoded (/ -> -)
    const claudeDir = path.join(os.homedir(), ".claude", "projects")
    const encodedPath = cwd.replace(/\//g, "-")
    const projectDir = path.join(claudeDir, encodedPath)

    if (!fs.existsSync(projectDir)) {
      return []
    }

    const sessions: SessionInfo[] = []

    try {
      const files = fs.readdirSync(projectDir)
      const jsonlFiles = files.filter(f => f.endsWith(".jsonl") && !f.startsWith("agent-"))

      for (const file of jsonlFiles) {
        const filePath = path.join(projectDir, file)
        const content = fs.readFileSync(filePath, "utf-8")
        const lines = content.trim().split("\n").filter(Boolean)

        if (lines.length === 0) continue

        try {
          // Parse first line to get session info
          const firstEntry = JSON.parse(lines[0]!)
          const sessionId = firstEntry.sessionId || file.replace(".jsonl", "")

          // Find first user message for title
          let title: string | undefined
          for (const line of lines) {
            try {
              const entry = JSON.parse(line)
              if (entry.type === "user" && entry.message?.content) {
                const content = entry.message.content
                title = typeof content === "string"
                  ? content.slice(0, 100)
                  : content[0]?.text?.slice(0, 100)
                break
              }
            } catch (e) {
              logger.debug("Failed to parse session line", { file, error: e })
            }
          }

          // Get file modification time as updatedAt
          const stat = fs.statSync(filePath)

          sessions.push({
            sessionId,
            cwd,
            title,
            updatedAt: stat.mtimeMs,
          })
        } catch (e) {
          logger.debug("Failed to parse session file", { file, error: e })
        }
      }
    } catch (e) {
      logger.debug("Failed to list claude sessions", { error: e })
      return []
    }

    // Sort by updatedAt descending (most recent first)
    return sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  }

  /**
   * Load a session and return its content
   */
  async loadSessionContent(sessionId: string, cwd: string): Promise<SessionContent> {
    if (!this.client) {
      throw new Error("Client not connected")
    }

    // Clear any existing updates for this session
    this.sessionUpdates.set(sessionId, [])

    // Load the session - this will stream updates via sessionUpdate handler
    if (this.client.loadSession) {
      await this.client.loadSession({
        sessionId,
        cwd,
        mcpServers: [],
      })
    }

    // Return collected notifications
    return {
      sessionId,
      notifications: this.sessionUpdates.get(sessionId) || [],
    }
  }

  /**
   * Create a new session and send the review prompt
   * Returns the sessionId immediately, completes when prompt finishes
   * Note: Use connect(onUpdate) to receive streaming notifications
   */
  async createReviewSession(
    cwd: string,
    hunksContext: string,
    sessionsContext: string,
    outputPath: string,
    onSessionCreated?: (sessionId: string) => void,
  ): Promise<string> {
    if (!this.client) {
      throw new Error("Client not connected")
    }

    logger.info("Creating new ACP session...", { cwd, outputPath })

    // Create new session with _meta to mark it as a critique session
    const { sessionId } = await this.client.newSession({
      cwd,
      mcpServers: [],
      _meta: { critique: true },
    })
    logger.info("Session created", { sessionId })

    // Notify caller of sessionId so they can start filtering notifications
    if (onSessionCreated) {
      onSessionCreated(sessionId)
    }

    // Build the review prompt
    const prompt = buildReviewPrompt(hunksContext, sessionsContext, outputPath)
    logger.info("Sending review prompt to AI...", { promptLength: prompt.length })

    // Send the prompt and wait for completion
    try {
      await this.client.prompt({
        sessionId,
        prompt: [{ type: "text", text: prompt }],
      })
      logger.info("Review prompt completed successfully")
    } catch (error) {
      logger.error("Review prompt failed", error)
      throw error
    }

    return sessionId
  }

  /**
   * Get collected session updates
   */
  getSessionUpdates(sessionId: string): SessionNotification[] {
    return this.sessionUpdates.get(sessionId) || []
  }

  /**
   * Close the connection and kill the process
   */
  async close(): Promise<void> {
    if (this.proc) {
      this.proc.kill()
      this.proc = null
    }
    this.client = null
    this.sessionUpdates.clear()
  }
}

/**
 * Build the review prompt for the AI
 */
function buildReviewPrompt(
  hunksContext: string,
  sessionsContext: string,
  outputPath: string,
): string {
  return `You are reviewing a git diff. Explain the changes so a reader builds a clear mental model.

<task>
Output file: ${outputPath}

IMPORTANT: Never use emojis or non-ASCII characters except for box-drawing characters in diagrams.

═══════════════════════════════════════════════════════════════════════════════
READING ORDER - The Guiding Principle
═══════════════════════════════════════════════════════════════════════════════

The reader reads top to bottom. You control their mental model. Order groups so each builds on the previous:

1. Config/infrastructure (sets the stage)
2. Types and interfaces (vocabulary)
3. Core utilities (foundational pieces)
4. Main implementation (reader now has context)
5. Integration and usage (how it connects)
6. Tests and docs (validation)

Show "what" before "how". Show data structures before code that uses them.

═══════════════════════════════════════════════════════════════════════════════
HOW TO EXPLAIN - Diagrams First, Text Last
═══════════════════════════════════════════════════════════════════════════════

PREFER ASCII DIAGRAMS - they explain better than words.
ALWAYS wrap diagrams in \`\`\` code blocks - never render them as plain text:

\`\`\`
┌─────────────┐      ┌─────────────┐      ┌────────────┐
│   Request   │ ───> │   Router    │ ───> │   Handler  │
└─────────────┘      └──────┬──────┘      └──────┬─────┘
                            │                    │
                            v                    v
                    ┌─────────────┐      ┌─────────────┐
                    │  Middleware │      │  Response   │
                    └─────────────┘      └─────────────┘
\`\`\`

\`\`\`
                    ┌──────────────────┐
                    │     Initial      │
                    └────────┬─────────┘
                             │ start()
                             v
┌───────────┐ fail   ┌──────────────────┐  success  ┌───────────┐
│   Error   │ <───── │    Processing    │ ────────> │  Complete │
└───────────┘        └──────────────────┘           └───────────┘
                             │ cancel()
                             v
                     ┌──────────────────┐
                     │    Cancelled     │
                     └──────────────────┘
\`\`\`

USE TABLES for comparisons and summaries:

| Field     | Before   | After    |
|-----------|----------|----------|
| timeout   | 5000     | 10000    |
| retries   | 3        | 5        |

TEXT IS LAST RESORT - max 3 lines, no filler, every word must add value.

═══════════════════════════════════════════════════════════════════════════════
SPLITTING RULES
═══════════════════════════════════════════════════════════════════════════════

- Each diff chunk: MAX 10 lines. Split aggressively to reduce cognitive load.
- Use numbered headers for sequential parts: ## 1. Parse input  ## 2. Validate  ## 3. Execute
- Split by logical boundaries (functions, concerns)
- Every chunk needs a description, even just a few words

Lines use cat -n format (1-based). Use lineRange to reference specific portions.

═══════════════════════════════════════════════════════════════════════════════
AUTO-GENERATED CODE - NEVER INCLUDE
═══════════════════════════════════════════════════════════════════════════════

NEVER include these in your review - they are pre-filtered but if any slip through, skip them:

Files to skip entirely:
- Lock files (package-lock.json, bun.lockb, yarn.lock, pnpm-lock.yaml, Cargo.lock, etc.)
- Auto-generated code (*.generated.ts, *.g.ts, *.d.ts)
- Build artifacts, minified files (*.min.js, *.bundle.js), source maps (*.map)
- Machine-generated diffs (migrations with timestamps, snapshots, etc.)
- Any file with "auto-generated" or "do not edit" comments at the top

Hunks to skip (even in otherwise relevant files):
- Test snapshots (toMatchInlineSnapshot values, .snap content) - no explanation needed
- Generated code blocks within files (GraphQL codegen, Prisma output, etc.)
- Large data literals (JSON fixtures, mock data arrays)

These add noise without insight. Do NOT waste the reader's time explaining them.

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════════════════════

Write YAML progressively (one item at a time so user sees progress):

1. First Write tool: create file with just "hunks:"
2. Then Edit tool for EACH item (one at a time)

\`\`\`yaml
# Group related hunks
- hunkIds: [1, 2]
  markdownDescription: |
    ## Title
    Brief explanation with diagram...

# Or reference part of a large hunk
- hunkId: 4
  lineRange: [1, 10]
  markdownDescription: |
    ## 1. First part
    What this section does...
\`\`\`

</task>

<hunks>
${hunksContext}
</hunks>

${sessionsContext ? `<session-context>
Context from coding sessions that may have created these changes:
${sessionsContext}
</session-context>` : ""}

Write the review to ${outputPath}. Cover all hunks (lockfiles and auto-generated files are already filtered out). Use diagrams liberally.`
}

/**
 * Create and connect an ACP client
 * @param agent - Which agent to use (opencode or claude)
 * @param onUpdate - Optional callback for session update notifications
 */
export async function createAcpClient(
  agent: AgentType = "opencode",
  onUpdate?: (notification: SessionNotification) => void,
): Promise<AcpClient> {
  const client = new AcpClient(agent)
  await client.connect(onUpdate)
  return client
}

// Keep backward compatibility alias
export { AcpClient as OpencodeAcpClient }
