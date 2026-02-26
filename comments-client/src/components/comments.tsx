// Comments — top-level component that renders the full comment UI.
// Drop this into any page to get Liveblocks-style overlay comments.
//
// Usage:
//   <CommentsProvider roomKey={url} host="your-worker.dev" userId={userId}>
//     <Comments />
//   </CommentsProvider>

import { CommentsOverlay } from "./overlay.js"
import { CommentsToolbar } from "./toolbar.js"

export function Comments() {
  return (
    <>
      <CommentsOverlay />
      <CommentsToolbar />
    </>
  )
}
