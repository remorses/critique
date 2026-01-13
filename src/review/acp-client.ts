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
  return `You are reviewing a git diff. Your task is to analyze the changes and group related hunks together with clear markdown descriptions.

<task>
Review the following git diff hunks. Group related hunks together and provide a concise markdown description explaining what each group of changes does.

Write your output to the file at: ${outputPath}

Use this YAML format, updating the file progressively as you analyze each group:

\`\`\`yaml
hunks:
# Option 1: Group multiple full hunks together
- hunkIds: [1, 2]
  markdownDescription: |
    ## Brief title
    
    Description of what these changes do and why they're related...

# Option 2: Reference a single hunk
- hunkIds: [3]
  markdownDescription: |
    ## Another title
    
    Description...

# Option 3: Reference part of a hunk using line numbers (for large hunks)
- hunkId: 4
  lineRange: [1, 10]
  markdownDescription: |
    ## First part of hunk 4
    
    Description of lines 1-10...

- hunkId: 4
  lineRange: [11, 25]
  markdownDescription: |
    ## Second part of hunk 4
    
    Description of lines 11-25...
\`\`\`

Lines are shown using cat -n format, with line numbers starting at 1. Use lineRange with these 1-based line numbers to split large hunks into logical parts if they contain multiple unrelated changes.

Guidelines:
- Group hunks that are logically related (same feature, same refactor, etc.)
- For large hunks with multiple logical changes, split them using lineRange
- Order groups for optimal code review flow:
  1. Infrastructure/config changes first
  2. Core/shared code changes
  3. Feature implementations
  4. Tests
  5. Documentation
- Keep descriptions concise but informative
- Use markdown formatting: headers (##), bullet points, **bold** for emphasis
- Mention file names when relevant
- Highlight any potential issues or things to pay attention to
- Ensure ALL hunks (or all lines within hunks) are covered by your explanations
</task>

<hunks>
${hunksContext}
</hunks>

${sessionsContext ? `<session-context>
The following is context from coding sessions that may have created these changes:
${sessionsContext}
</session-context>` : ""}

Now analyze the hunks and write the review YAML to ${outputPath}. Make sure to explain all changes - do not leave any hunks unexplained.`
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
