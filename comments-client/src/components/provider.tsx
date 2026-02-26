// CommentsProvider — top-level context provider for the comment system.
// Connects to the CommentRoom Agent via WebSocket, syncs thread state,
// and provides RPC methods to all child components.

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import { useAgent } from "agents/react"
import type {
  Thread,
  Comment,
  RoomState,
  CreateThreadInput,
  AddCommentInput,
  UpdateThreadMetadataInput,
  PresenceMessage,
} from "@critique.work/server/types"

interface CommentsContextValue {
  /** All threads in this room, synced in real-time */
  threads: Thread[]
  /** Whether the WebSocket connection is open */
  connected: boolean
  /** Current user ID (from cookie) */
  userId: string
  /** Optional display name */
  userName?: string
  /** Create a new thread with a pinned position and initial comment */
  createThread: (input: Omit<CreateThreadInput, "userId" | "userName">) => Promise<Thread>
  /** Add a comment to an existing thread */
  addComment: (input: Omit<AddCommentInput, "userId" | "userName">) => Promise<Comment>
  /** Toggle thread resolved state */
  resolveThread: (threadId: string) => Promise<void>
  /** Delete a thread and all its comments */
  deleteThread: (threadId: string) => Promise<void>
  /** Update thread pin position or metadata */
  updateThreadMetadata: (input: UpdateThreadMetadataInput) => Promise<void>
  /** Get all comments for a thread */
  getThreadComments: (threadId: string) => Promise<Comment[]>
  /** Send a cursor presence update */
  sendPresence: (message: PresenceMessage) => void
}

const CommentsContext = createContext<CommentsContextValue | null>(null)

export interface CommentsProviderProps {
  /** The room key — typically the page URL or a unique identifier */
  roomKey: string
  /** The host where the comments worker is deployed */
  host: string
  /** Current user ID (typically from a cookie) */
  userId: string
  /** Optional display name for the user */
  userName?: string
  /** Custom path prefix for agent routes (default: auto-detected) */
  path?: string
  children: ReactNode
}

export function CommentsProvider({
  roomKey,
  host,
  userId,
  userName,
  path,
  children,
}: CommentsProviderProps) {
  const [connected, setConnected] = useState(false)
  const [threads, setThreads] = useState<Thread[]>([])

  const agent = useAgent({
    agent: "CommentRoom",
    name: roomKey,
    host,
    path,
    query: {
      userId,
      ...(userName ? { userName } : {}),
    },
    onOpen: () => setConnected(true),
    onClose: () => {
      setConnected(false)
    },
    onStateUpdate: (state: RoomState) => {
      setThreads(state.threads)
    },
  })

  const createThread = useCallback(
    async (input: Omit<CreateThreadInput, "userId" | "userName">) => {
      return agent.call("createThread", [{ ...input, userId, userName }]) as Promise<Thread>
    },
    [agent, userId, userName],
  )

  const addComment = useCallback(
    async (input: Omit<AddCommentInput, "userId" | "userName">) => {
      return agent.call("addComment", [{ ...input, userId, userName }]) as Promise<Comment>
    },
    [agent, userId, userName],
  )

  const resolveThread = useCallback(
    async (threadId: string) => {
      await agent.call("resolveThread", [threadId])
    },
    [agent],
  )

  const deleteThread = useCallback(
    async (threadId: string) => {
      await agent.call("deleteThread", [threadId])
    },
    [agent],
  )

  const updateThreadMetadata = useCallback(
    async (input: UpdateThreadMetadataInput) => {
      await agent.call("updateThreadMetadata", [input])
    },
    [agent],
  )

  const getThreadComments = useCallback(
    async (threadId: string) => {
      return agent.call("getThreadComments", [threadId]) as Promise<Comment[]>
    },
    [agent],
  )

  const sendPresence = useCallback(
    (message: PresenceMessage) => {
      agent.send(JSON.stringify(message))
    },
    [agent],
  )

  const value: CommentsContextValue = {
    threads,
    connected,
    userId,
    userName,
    createThread,
    addComment,
    resolveThread,
    deleteThread,
    updateThreadMetadata,
    getThreadComments,
    sendPresence,
  }

  return <CommentsContext.Provider value={value}>{children}</CommentsContext.Provider>
}

export function useComments(): CommentsContextValue {
  const ctx = useContext(CommentsContext)
  if (!ctx) {
    throw new Error("useComments must be used within a <CommentsProvider>")
  }
  return ctx
}
