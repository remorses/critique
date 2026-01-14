// ACP client for connecting to opencode agent

import {
  ClientSideConnection,
  ndJsonStream,
  type SessionNotification,
  type SessionInfo as AcpSessionInfo,
} from "@agentclientprotocol/sdk"
import type { SessionInfo, SessionContent } from "./types.ts"
import { logger } from "../logger.ts"

/**
 * Client for communicating with opencode via ACP protocol
 */
export class OpencodeAcpClient {
  private proc: ReturnType<typeof Bun.spawn> | null = null
  private client: ClientSideConnection | null = null
  private sessionUpdates: Map<string, SessionNotification[]> = new Map()
  private onUpdateCallback: ((notification: SessionNotification) => void) | null = null

  constructor() {
    this.connect = this.connect.bind(this)
    this.listSessions = this.listSessions.bind(this)
    this.loadSessionContent = this.loadSessionContent.bind(this)
    this.createReviewSession = this.createReviewSession.bind(this)
    this.close = this.close.bind(this)
  }

  /**
   * Spawn opencode ACP server and establish connection
   * @param onUpdate - Optional callback for session update notifications
   */
  async connect(onUpdate?: (notification: SessionNotification) => void): Promise<void> {
    this.onUpdateCallback = onUpdate || null
    logger.info("Spawning opencode ACP server...")

    // Spawn opencode in ACP mode
    this.proc = Bun.spawn(["bunx", "opencode", "acp"], {
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
   * Uses CLI command for opencode since ACP doesn't support listSessions yet
   */
  async listSessions(cwd: string): Promise<SessionInfo[]> {
    // Use CLI command to list sessions (opencode ACP doesn't support this yet)
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
      }>

      // Filter sessions to only those matching the cwd
      return sessions
        .filter((s) => s.directory === cwd)
        .map((s) => ({
          sessionId: s.id,
          cwd: s.directory,
          title: s.title || undefined,
          updatedAt: s.updated,
        }))
    } catch {
      return []
    }

    /* ACP implementation for CLIs that support unstable_listSessions:
    if (this.client) {
      const response = await this.client.unstable_listSessions({ cwd })
      return response.sessions.map((s: AcpSessionInfo) => ({
        sessionId: s.sessionId,
        cwd: s.cwd,
        title: s.title ?? undefined,
        updatedAt: s.updatedAt ?? undefined,
      }))
    }
    return []
    */
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

    // Create new session
    const { sessionId } = await this.client.newSession({
      cwd,
      mcpServers: [],
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
SKIPPING FILES
═══════════════════════════════════════════════════════════════════════════════

You MAY skip files that add noise without insight:

- Lock files (package-lock.json, bun.lockb, yarn.lock)
- Auto-generated code (*.generated.ts, *.d.ts from codegen)
- Build artifacts, minified files, source maps
- Large machine-generated diffs (migrations with timestamps, etc.)

When skipping, add ONE entry at the end:

\`\`\`yaml
- hunkIds: [45, 46, 47]
  markdownDescription: |
    ## Skipped: Auto-generated files
    Lock files and generated types - no manual changes.
\`\`\`

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

Write the review to ${outputPath}. Cover ALL hunks. Use diagrams liberally.`
}

/**
 * Create and connect an ACP client
 * @param onUpdate - Optional callback for session update notifications
 */
export async function createAcpClient(
  onUpdate?: (notification: SessionNotification) => void,
): Promise<OpencodeAcpClient> {
  const client = new OpencodeAcpClient()
  await client.connect(onUpdate)
  return client
}
