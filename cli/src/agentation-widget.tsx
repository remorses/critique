// Widget entry point — self-initializing script for static HTML pages.
// Reads config from window.__CRITIQUE_CONFIG__, creates a React root,
// and renders the Agentation component for annotation UI.
//
// This is used by pages that don't have React (e.g., critique's static diff pages).
//
// Usage: inject into HTML before </body>:
//   <script>window.__CRITIQUE_CONFIG__ = { endpoint: "https://critique.work/a", sessionId: "abc123", userId: "user-1" }</script>
//   <script src="/agentation-widget.js"></script>
//
// Performance optimization:
//   Critique diff pages can have 185K+ DOM nodes (6,500+ div.line elements each
//   containing many spans). We inject content-visibility: auto on .line elements
//   so the browser only renders visible lines, skipping layout/paint for the
//   ~6,400 off-screen lines. This brings page load from ~16s to <2s on large diffs.

interface CritiqueConfig {
  endpoint: string
  sessionId: string
  userId: string
  /** Whether to show the pause/resume animations button. Defaults to true. */
  showFreezeButton?: boolean
}

function injectContentVisibility() {
  if (document.getElementById("critique-cv-styles")) return
  const style = document.createElement("style")
  style.id = "critique-cv-styles"
  style.textContent = `
    #content > .line {
      content-visibility: auto;
      contain-intrinsic-height: auto 20px;
    }
  `
  document.head.appendChild(style)
}

async function init() {
  // Inject content-visibility optimization before anything else
  injectContentVisibility()

  // Seed agentation theme from system preference before it reads localStorage.
  // Agentation reads localStorage["feedback-toolbar-theme"] on mount and
  // defaults to dark if absent. We set it to match the OS color scheme so
  // the widget looks correct on light-mode systems from the first render.
  if (!localStorage.getItem("feedback-toolbar-theme")) {
    const isLight = window.matchMedia("(prefers-color-scheme: light)").matches
    localStorage.setItem("feedback-toolbar-theme", isLight ? "light" : "dark")
  }

  if (document.getElementById("critique-agentation")) return

  const config = (window as any).__CRITIQUE_CONFIG__ as CritiqueConfig | undefined
  if (!config?.endpoint || !config?.sessionId) {
    console.warn("[critique] Missing window.__CRITIQUE_CONFIG__")
    return
  }

  const container = document.createElement("div")
  container.id = "critique-agentation"
  document.body.appendChild(container)

  // Use preact's render() directly since the build aliases react → preact/compat.
  // preact/compat does not export createRoot from react-dom/client.
  const [{ Agentation }, { render, h }] = await Promise.all([
    import("@critique.work/agentation"),
    import("preact"),
  ])

  render(
    h(Agentation, {
      endpoint: config.endpoint,
      sessionId: config.sessionId,
      showFreezeButton: config.showFreezeButton,
    }),
    container,
  )
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init)
} else {
  init()
}
