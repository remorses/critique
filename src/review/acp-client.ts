// ACP (Agent Client Protocol) client for communicating with AI coding assistants.
// Supports OpenCode and Claude Code agents for session listing, content loading,
// and creating AI-powered review sessions with streaming updates.

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
  private connectionPromise: Promise<void> | null = null

  constructor(agent: AgentType = "opencode") {
    this.agent = agent
    this.connect = this.connect.bind(this)
    this.ensureConnected = this.ensureConnected.bind(this)
    this.listSessions = this.listSessions.bind(this)
    this.loadSessionContent = this.loadSessionContent.bind(this)
    this.createReviewSession = this.createReviewSession.bind(this)
    this.close = this.close.bind(this)
  }

  /**
   * Start ACP connection in background (non-blocking)
   * Call this early to warm up the connection while doing other work
   * @param onUpdate - Optional callback for session update notifications
   */
  startConnection(onUpdate?: (notification: SessionNotification) => void): void {
    if (this.connectionPromise) return // Already started
    // Defer to next microtask so caller can continue immediately
    // This ensures Bun.spawn doesn't block the current execution
    this.connectionPromise = Promise.resolve().then(() => this.connect(onUpdate))
  }

  /**
   * Wait for ACP connection to be ready
   * Starts connection if not already started
   */
  private async ensureConnected(): Promise<void> {
    if (!this.connectionPromise) {
      this.connectionPromise = this.connect(this.onUpdateCallback || undefined)
    }
    await this.connectionPromise
  }

  /**
   * Spawn ACP server and establish connection
   * @param onUpdate - Optional callback for session update notifications
   */
  private async connect(onUpdate?: (notification: SessionNotification) => void): Promise<void> {
    this.onUpdateCallback = onUpdate || null
    logger.info(`Spawning ${this.agent} ACP server...`)

    // Spawn the appropriate ACP server
    const command = this.agent === "opencode"
      ? ["opencode", "acp"]
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
   * Uses ACP unstable_listSessions, falls back to file parsing for Claude
   * @param cwd - Working directory to filter sessions by
   * @param limit - Maximum number of sessions to return (default: 10)
   */
  async listSessions(cwd: string, limit = 10): Promise<SessionInfo[]> {
    await this.ensureConnected()
    if (!this.client) {
      throw new Error("Client connection failed")
    }

    // Try ACP unstable_listSessions first
    try {
      const sessions: SessionInfo[] = []
      let cursor: string | undefined

      // Paginate until we have enough sessions or no more results
      while (sessions.length < limit) {
        const response = await this.client.unstable_listSessions({
          cwd,
          cursor,
        })

        // Convert ACP SessionInfo to our local type
        for (const acpSession of response.sessions) {
          if (sessions.length >= limit) break

          sessions.push({
            sessionId: acpSession.sessionId,
            cwd: acpSession.cwd,
            title: acpSession.title ?? undefined,
            // Convert ISO 8601 string to timestamp (milliseconds)
            updatedAt: acpSession.updatedAt ? new Date(acpSession.updatedAt).getTime() : undefined,
            _meta: acpSession._meta,
          })
        }

        // Check if there are more pages
        if (!response.nextCursor) break
        cursor = response.nextCursor
      }

      // Sessions should already be sorted by the server, but ensure descending order
      return sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    } catch (error) {
      // Fall back to file-based listing for agents that don't support listSessions
      logger.debug("ACP listSessions not supported, falling back to file parsing", { error })
      if (this.agent === "claude") {
        return this.listClaudeSessions(cwd, limit)
      }
      throw error
    }
  }

  /**
   * List Claude Code sessions by parsing JSONL files (fallback)
   * Sessions are stored in ~/.claude/projects/<path-encoded>/
   * @param cwd - Working directory to filter sessions by
   * @param limit - Maximum number of sessions to return
   */
  private async listClaudeSessions(cwd: string, limit: number): Promise<SessionInfo[]> {
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

    // Sort by updatedAt descending (most recent first) and apply limit
    return sessions
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, limit)
  }

  /**
   * Load a session and return its content
   */
  async loadSessionContent(sessionId: string, cwd: string): Promise<SessionContent> {
    await this.ensureConnected()
    if (!this.client) {
      throw new Error("Client connection failed")
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
   * @param options.model - Optional model ID to use (format depends on agent: "anthropic/claude-sonnet-4-..." for opencode, "claude-sonnet-4-..." for claude)
   */
  async createReviewSession(
    cwd: string,
    hunksContext: string,
    sessionsContext: string,
    outputPath: string,
    onSessionCreated?: (sessionId: string) => void,
    options?: { model?: string },
  ): Promise<string> {
    await this.ensureConnected()
    if (!this.client) {
      throw new Error("Client connection failed")
    }

    logger.info("Creating new ACP session...", { cwd, outputPath, model: options?.model })

    // Create new session with _meta to mark it as a critique session
    const response = await this.client.newSession({
      cwd,
      mcpServers: [],
      _meta: { critique: true },
    })
    const { sessionId } = response
    logger.info("Session created", { sessionId })

    // Set model if specified
    if (options?.model) {
      const availableModels = response.models?.availableModels ?? []
      const modelExists = availableModels.some(m => m.modelId === options.model)

      if (!modelExists) {
        const modelList = availableModels.map(m => `  ${m.modelId}`).join("\n")
        const agentHint = this.agent === "opencode"
          ? "provider/model-id (e.g., anthropic/claude-sonnet-4-20250514)"
          : "model-id (e.g., claude-sonnet-4-20250514)"
        throw new Error(
          `Model "${options.model}" not found.\n\n` +
          `Available models:\n${modelList || "  (none)"}\n\n` +
          `Format for ${this.agent}: ${agentHint}`
        )
      }

      logger.info("Setting model...", { model: options.model })
      await this.client.unstable_setSessionModel({
        sessionId,
        modelId: options.model,
      })
      logger.info("Model set successfully")
    }

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
   * Resume an existing ACP session
   * Uses session/resume to reconnect to an interrupted session
   * @returns true if resume succeeded, false if session not found/expired
   */
  async resumeSession(
    sessionId: string,
    cwd: string,
  ): Promise<boolean> {
    await this.ensureConnected()

    if (!this.client) {
      throw new Error("ACP client not connected")
    }

    try {
      logger.info("Attempting to resume ACP session...", { sessionId })
      await this.client.unstable_resumeSession({
        sessionId,
        cwd,
      })
      logger.info("ACP session resumed successfully")
      return true
    } catch (error) {
      logger.warn("Failed to resume ACP session", { sessionId, error })
      return false
    }
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

THINK HARD BEFORE WRITING. Before you start editing the YAML file, carefully plan the full order of all hunks. Consider:
- What is the main story of this change?
- What should the reader understand first to make everything else click?
- Which hunks are essential vs supporting details?

The reader reads top to bottom. You control their mental model. 

ORDER BY CODE FLOW - Follow how the code actually executes in the app:
- Start with entry points (what gets called first)
- Then show what those call (the next layer down)
- Continue down to the dependencies

This creates an intuitive progression: dependants before dependencies. The reader follows the same path the code takes at runtime.

Practical ordering:
1. Entry points and main implementation (routes, handlers, commands - where execution starts)
2. Business logic (what the entry points call)
3. Types and interfaces (if needed to understand the above)
4. Integration points (how it connects to external systems)
5. Tests and docs (validation)
6. Utilities and helpers (supporting functions - reader already saw them being used)
7. Config/infrastructure (setup, boilerplate - least essential)

Utils, infra, and config are supporting cast - put them last. The reader already saw them referenced above and can now understand their implementation.

═══════════════════════════════════════════════════════════════════════════════
WHAT TO EXPLAIN - Why Over What
═══════════════════════════════════════════════════════════════════════════════

The reader can SEE what changed. Your job is to explain WHY and provide CONTEXT.

Focus on:
- Why was this change made? What problem does it solve?
- What's the intent behind the approach?
- What should the reader understand that isn't obvious from the code?

AUDIENCE: The reader is a developer familiar with the codebase. Don't over-explain:
- Language syntax or standard patterns (React hooks, async/await, etc.)
- What a function does when the name is self-explanatory
- Boilerplate or ceremony required by frameworks

TITLES should be action-oriented and specific:
- Good: "Add retry logic with exponential backoff"
- Good: "Fix race condition in session cleanup"
- Bad: "Changes to utils.ts"
- Bad: "Update function"

CHANGE TYPES benefit from different focus:

Bug fixes - explain:
- What was broken (the symptom)
- Why it happened (root cause)
- How this fixes it

Features - explain:
- What it enables (user value)
- How to use it (if not obvious)
- Key design decisions

Refactors - explain:
- Why restructure now?
- What's better about the new structure?

ANTI-PATTERNS to avoid:
- "This file was modified" (says nothing)
- Restating the code in prose ("this adds a variable called count")
- Explaining obvious things ("useState is a React hook")
- Generic filler ("this improves the code")

═══════════════════════════════════════════════════════════════════════════════
HOW TO EXPLAIN - Diagrams First, Text Last
═══════════════════════════════════════════════════════════════════════════════

PREFER ASCII DIAGRAMS - they explain better than words.
ALWAYS wrap diagrams in \`\`\`diagram code blocks - never render them as plain text.
CRITICAL: Always close each code block with \`\`\` before any new text or heading. Never leave code blocks unclosed.

\`\`\`diagram
┌─────────────┐      ┌─────────────┐      ┌────────────┐
│   Request   │ ───▶ │   Router    │ ───▶ │   Handler  │
└─────────────┘      └──────┬──────┘      └──────┬─────┘
                            │                    │
                            ▼                    ▼
                    ┌─────────────┐      ┌─────────────┐
                    │  Middleware │      │  Response   │
                    └─────────────┘      └─────────────┘
\`\`\`

\`\`\`diagram
                    ┌──────────────────┐
                    │     Initial      │
                    └────────┬─────────┘
                             │ start()
                             ▼
┌───────────┐ fail   ┌──────────────────┐  success  ┌───────────┐
│   Error   │ ◀───── │    Processing    │ ────────▶ │  Complete │
└───────────┘        └──────────────────┘           └───────────┘
                             │ cancel()
                             ▼
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
SPLITTING RULES - NEVER SHOW MORE THAN 10 LINES AT ONCE
═══════════════════════════════════════════════════════════════════════════════

CRITICAL: Never show hunks larger than 10 lines. This is the most important rule.
Split aggressively to reduce cognitive load. Readers absorb small chunks better.

For HEAVY LOGIC - split even one or two lines at a time:
- When code is dense or complex, show exactly what happens step by step
- Follow the same order the code executes - reader builds the mental model progressively
- You can interleave hunks from different files to follow the execution flow
- Example: show a function call, then the function it calls, then back to the caller

For ADDED FILES (new files):
- Split into logical parts: imports, types, then each function/method separately
- Each function/class method gets its own chunk with a brief description
- Describe what each function does and why it exists
- Example: A 50-line new file becomes 5+ chunks of ~10 lines each

For MODIFIED FILES:
- Split by logical boundaries (functions, concerns, before/after)
- Use numbered headers for sequential parts: ## 1. Parse input  ## 2. Validate  ## 3. Execute

You control the order. Reorder and interleave hunks freely to tell the clearest story.

Every chunk MUST have a description explaining its purpose, even just one line.

Lines use cat -n format (1-based). Use lineRange to reference specific portions of large hunks.

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

1. First Write tool: create file with title and hunks header
2. Then Edit tool for EACH item (one at a time)

\`\`\`yaml
title: "Short summary of the overall change (50 chars max)"
hunks:
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

The \`title\` field should be a concise summary like:
- "Add user authentication with OAuth"
- "Fix race condition in session cleanup"  
- "Refactor API routes to use middleware"

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
 * Create an ACP client and optionally start connection in background
 * Connection is lazy - will connect on first method that needs it
 * @param agent - Which agent to use (opencode or claude)
 * @param onUpdate - Optional callback for session update notifications
 * @param startConnectionNow - If true, starts connection immediately in background
 */
export function createAcpClient(
  agent: AgentType = "opencode",
  onUpdate?: (notification: SessionNotification) => void,
  startConnectionNow = false,
): AcpClient {
  const client = new AcpClient(agent)
  if (startConnectionNow) {
    client.startConnection(onUpdate)
  }
  return client
}

// Keep backward compatibility alias
export { AcpClient as OpencodeAcpClient }
