// Widget entry point — self-initializing script for static HTML pages.
// Reads config from window.__CRITIQUE_COMMENTS__, creates a React root,
// and renders the full comments UI (overlay pins, toolbar, sidebar).
//
// This is used by pages that don't have React (e.g., critique's static diff pages).
// For React apps, import CommentsProvider + Comments directly from the package instead.
//
// Usage: inject into HTML before </body>:
//   <link rel="stylesheet" href="/comments.css">
//   <script>window.__CRITIQUE_COMMENTS__ = { roomKey: "page-id", host: "https://comments.example.com", userId: "user-123" }</script>
//   <script src="/comments.js"></script>

import { createRoot } from "react-dom/client"
import { CommentsProvider } from "./components/provider.js"
import { Comments } from "./components/comments.js"

interface WidgetConfig {
  roomKey: string
  host: string
  userId: string
  userName?: string
}

function init() {
  // Idempotency guard: don't mount twice if script is loaded multiple times
  if (document.getElementById("cw-root")) return

  const config = (window as any).__CRITIQUE_COMMENTS__ as WidgetConfig | undefined
  if (!config) {
    console.warn("[critique-comments] Missing window.__CRITIQUE_COMMENTS__ config, skipping init")
    return
  }

  if (!config.roomKey || !config.host || !config.userId) {
    console.warn("[critique-comments] Config must include roomKey, host, and userId")
    return
  }

  // Create container element
  const container = document.createElement("div")
  container.id = "cw-root"
  document.body.appendChild(container)

  // Render the comments UI
  const root = createRoot(container)
  root.render(
    <CommentsProvider
      roomKey={config.roomKey}
      host={config.host}
      userId={config.userId}
      userName={config.userName}
    >
      <Comments />
    </CommentsProvider>,
  )
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init)
} else {
  init()
}
