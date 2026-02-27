// @critique.work/client — React components for Liveblocks-style overlay comments.
// Connect to a @critique.work/server worker to get real-time threaded comments
// pinned to any position on any web page.
//
// Usage:
//   import { CommentsProvider, Comments } from "@critique.work/client"
//   import "@critique.work/client/styles.css"
//
//   <CommentsProvider roomKey={pageUrl} host="comments.your-domain.com" userId={userId}>
//     <Comments />
//   </CommentsProvider>

// Main components
export { Comments } from "./components/comments.js"
export { CommentsProvider, useComments } from "./components/provider.js"
export type { CommentsProviderProps } from "./components/provider.js"

// Individual components (for custom layouts)
export { CommentsOverlay } from "./components/overlay.js"
export { CommentsToolbar } from "./components/toolbar.js"
export { CommentsSidebar } from "./components/sidebar.js"
export type { CommentsSidebarProps } from "./components/sidebar.js"
export { ThreadView } from "./components/thread-view.js"
export type { ThreadViewProps } from "./components/thread-view.js"
export { Composer } from "./components/composer.js"
export type { ComposerProps } from "./components/composer.js"
export { NewThread } from "./components/new-thread.js"
export type { NewThreadProps, CommentingState } from "./components/new-thread.js"

// Coordinate system (for custom overlay implementations)
export {
  getCoordsFromPointerEvent,
  getCoordsFromElement,
  getCoordsFromAccurateCursorPositions,
  getElementBeneath,
} from "./lib/coords.js"
export type { AccurateCursorPositions, PageCoords } from "./lib/coords.js"

// Hooks
export { useMaxZIndex } from "./hooks/use-max-z-index.js"
export { useNearEdge } from "./hooks/use-near-edge.js"
export type { EdgeState } from "./hooks/use-near-edge.js"

// Re-export types from server for convenience
export type {
  Thread,
  Comment,
  ThreadMetadata,
  RoomState,
  CreateThreadInput,
  AddCommentInput,
  UpdateThreadMetadataInput,
  CommentsApiResponse,
  CommentPreview,
  PresenceMessage,
} from "@critique.work/server/types"
