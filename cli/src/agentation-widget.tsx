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
//
// iOS Safari pinch-zoom fix:
//   position:fixed is relative to the layout viewport, not the visual viewport.
//   When users pinch-to-zoom on iOS Safari, the widget drifts with the zoomed
//   content and can end up mispositioned after zooming out. We use the
//   visualViewport API to apply a counter-transform that keeps the widget
//   anchored to the bottom-right of what the user actually sees.

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

  // Fix position:fixed drift during pinch-to-zoom on iOS Safari.
  // The visualViewport API tells us how the visible area has shifted
  // relative to the layout viewport. We apply a counter-transform so
  // the widget stays anchored to the visual viewport's bottom-right.
  setupVisualViewportFix(container)

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

function setupVisualViewportFix(container: HTMLElement) {
  const vv = window.visualViewport
  if (!vv) return

  function update() {
    if (!vv) return
    if (vv.scale <= 1.01) {
      // No zoom — clear any transform so default fixed positioning works
      container.style.transform = ""
      return
    }
    // Translate the container so it follows the visual viewport's position,
    // then scale it back to its original size (counter the zoom).
    container.style.transform = [
      `translate(${vv.offsetLeft}px, ${vv.offsetTop}px)`,
      `scale(${1 / vv.scale})`,
    ].join(" ")
    // Set transform-origin to top-left so the translate values are intuitive
    container.style.transformOrigin = "top left"
  }

  vv.addEventListener("resize", update)
  vv.addEventListener("scroll", update)
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init)
} else {
  init()
}
