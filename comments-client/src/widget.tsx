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
// CSS scope isolation:
//   Agentation injects ~365 CSS rules into document.head at module load time.
//   On pages with large DOMs, Safari re-evaluates all elements against these
//   rules even though they use CSS Modules class names that don't match diff
//   elements. We wrap agentation's CSS in @scope (body) to (#content) so the
//   browser excludes the diff subtree from selector matching entirely.
//   All agentation DOM (toolbar, markers, popups) lives outside #content,
//   so scoping doesn't break anything. Falls back to unscoped CSS on
//   browsers without @scope support (Safari < 17.4).

interface CritiqueConfig {
  endpoint: string
  sessionId: string
  userId: string
}

// IDs of agentation's injected <style> elements
const AGENTATION_STYLE_IDS = new Set([
  "feedback-tool-styles-annotation-popup-css-styles",
  "feedback-tool-styles-page-toolbar-css-styles",
])

// Check if @scope is supported (Safari 17.4+, Chrome 118+, Firefox 128+)
let scopeSupported: boolean | null = null
function isScopeSupported(): boolean {
  if (scopeSupported !== null) return scopeSupported
  try {
    // Test by creating a stylesheet with @scope and checking if it parses
    const sheet = new CSSStyleSheet()
    sheet.replaceSync("@scope (body) { .test { color: red } }")
    scopeSupported = sheet.cssRules.length > 0
  } catch {
    scopeSupported = false
  }
  return scopeSupported
}

// Wrap CSS in @scope to exclude #content subtree from selector matching.
// All agentation DOM elements are outside #content (toolbar portals to body,
// markers are body-level divs), so scoping doesn't affect them.
function wrapInScope(css: string): string {
  return `@scope (body) to (#content) {\n${css}\n}`
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

  if (document.getElementById("critique-agentation")) return

  const config = (window as any).__CRITIQUE_CONFIG__ as CritiqueConfig | undefined
  if (!config?.endpoint || !config?.sessionId) {
    console.warn("[critique] Missing window.__CRITIQUE_CONFIG__")
    return
  }

  const container = document.createElement("div")
  container.id = "critique-agentation"
  document.body.appendChild(container)

  // Monkey-patch Node.prototype.appendChild to intercept agentation's style
  // injection. Wraps CSS in @scope so Safari doesn't re-evaluate 185K+ diff
  // elements against agentation's 365 CSS rules.
  const useScope = isScopeSupported() && !!document.getElementById("content")
  const origAppendChild = Node.prototype.appendChild
  if (useScope) {
    Node.prototype.appendChild = function <T extends Node>(node: T): T {
      if (
        this === document.head &&
        node instanceof HTMLStyleElement &&
        node.id &&
        AGENTATION_STYLE_IDS.has(node.id) &&
        node.textContent
      ) {
        node.textContent = wrapInScope(node.textContent)
      }
      return origAppendChild.call(this, node) as T
    }
  }

  // Dynamic import ensures monkey-patch is active before agentation's
  // module-level code runs (static imports would hoist and execute first)
  const [{ Agentation }, { createRoot }] = await Promise.all([
    import("agentation"),
    import("react-dom/client"),
  ])

  // Restore original appendChild
  if (useScope) {
    Node.prototype.appendChild = origAppendChild
  }

  createRoot(container).render(
    <Agentation
      endpoint={config.endpoint}
      sessionId={config.sessionId}
    />,
  )
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init)
} else {
  init()
}
