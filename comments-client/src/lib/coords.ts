// CSS-selector-based coordinate system for pinning comments to DOM elements.
// Instead of storing pixel positions (which break on resize/reflow), we store
// multiple fallback CSS selectors plus fractional x/y offsets within the matched element.
// On render, we try each selector until one resolves, then compute the pixel position.
//
// Derived from the Liveblocks overlay comments approach.

export interface AccurateCursorPositions {
  cursorSelectors: string[]
  cursorX: number
  cursorY: number
}

export interface PageCoords {
  x: number
  y: number
}

/**
 * Given a pointer event, walk the composed path to build fallback CSS selectors
 * and compute the fractional position within the target element.
 */
export function getCoordsFromPointerEvent(
  event: PointerEvent | MouseEvent,
  dragOffset?: { x: number; y: number },
): AccurateCursorPositions | null {
  const rawPath = event.composedPath()
  // Filter to only Element nodes (skip Text, Document, etc.)
  const path = rawPath.filter((node): node is Element => node instanceof Element)
  const target = path[0]
  if (!target) return null

  const rect = target.getBoundingClientRect()
  const offsetX = dragOffset?.x ?? 0
  const offsetY = dragOffset?.y ?? 0
  const safeWidth = rect.width || 1
  const safeHeight = rect.height || 1
  const cursorX = Math.max(0, Math.min(1, (event.clientX - rect.left - offsetX) / safeWidth))
  const cursorY = Math.max(0, Math.min(1, (event.clientY - rect.top - offsetY) / safeHeight))

  const selectors = generateSelectors(path)
  if (!selectors) return null

  return { cursorSelectors: selectors, cursorX, cursorY }
}

/**
 * Given a DOM element and client coordinates, compute selector-based positions.
 * Used when repositioning a pin via drag-and-drop.
 */
export function getCoordsFromElement(
  element: Element,
  clientX: number,
  clientY: number,
  dragOffset?: { x: number; y: number },
): AccurateCursorPositions | null {
  const path = buildPathToBody(element)
  if (!path.length) return null

  const rect = element.getBoundingClientRect()
  const offsetX = dragOffset?.x ?? 0
  const offsetY = dragOffset?.y ?? 0
  const safeWidth = rect.width || 1
  const safeHeight = rect.height || 1
  const cursorX = Math.max(0, Math.min(1, (clientX - rect.left - offsetX) / safeWidth))
  const cursorY = Math.max(0, Math.min(1, (clientY - rect.top - offsetY) / safeHeight))

  const selectors = generateSelectors(path)
  if (!selectors) return null

  return { cursorSelectors: selectors, cursorX, cursorY }
}

/**
 * Resolve stored selectors back to page pixel coordinates.
 * Tries each selector in order; returns null if all fail.
 */
export function getCoordsFromAccurateCursorPositions(
  positions: AccurateCursorPositions,
): PageCoords | null {
  for (const selector of positions.cursorSelectors) {
    try {
      const el = document.querySelector(selector)
      if (el && el.getClientRects().length > 0) {
        const rect = el.getBoundingClientRect()
        return {
          x: rect.left + rect.width * positions.cursorX + window.scrollX,
          y: rect.top + rect.height * positions.cursorY + window.scrollY,
        }
      }
    } catch {
      // Invalid selector, skip
    }
  }
  return null
}

/**
 * Get the element beneath a given element at a specific point.
 * Temporarily hides the element so elementFromPoint can see through it.
 */
export function getElementBeneath(
  element: HTMLElement,
  clientX: number,
  clientY: number,
): Element | null {
  const prev = element.style.pointerEvents
  element.style.pointerEvents = "none"
  const beneath = document.elementFromPoint(clientX, clientY)
  element.style.pointerEvents = prev
  return beneath
}

// --- Internal helpers ---

function buildPathToBody(element: Element): Element[] {
  const path: Element[] = []
  let current: Element | null = element
  while (current && current !== document.documentElement) {
    path.push(current)
    current = current.parentElement
  }
  return path
}

function escapeCSS(str: string): string {
  return CSS.escape(str)
}

/**
 * Generate up to 4 fallback CSS selectors from a DOM path (most-specific first):
 * 1. Direct ID selector (#id)
 * 2. nth-child path from nearest ancestor with ID
 * 3. Full nth-child path from BODY
 * 4. Class-name path from BODY (least stable)
 */
function generateSelectors(pathArray: Element[]): string[] | null {
  if (!pathArray.length) return null

  const nthChildParts: string[] = []
  const classNameParts: string[] = []
  let reachedBody = false
  let lowestId: string | null = null
  let lowestIdIndex = -1

  for (let i = 0; i < pathArray.length; i++) {
    const el = pathArray[i]
    if (el.nodeName === "BODY") {
      reachedBody = true
      break
    }

    // nth-child selector part
    const parent = el.parentElement
    if (parent) {
      const children = Array.from(parent.children)
      const nthIndex = children.indexOf(el) + 1
      nthChildParts.push(`${el.nodeName}:nth-child(${nthIndex})`)
    } else {
      nthChildParts.push(el.nodeName)
    }

    // Track nearest ancestor with ID
    if (!lowestId && el.id) {
      lowestId = el.id
      lowestIdIndex = i
    }

    // Class-based selector part
    const classes = Array.from(el.classList).map(escapeCSS).join(".")
    classNameParts.push(el.nodeName + (classes ? `.${classes}` : ""))
  }

  if (!reachedBody) return null

  const selectors: string[] = []

  // 1. Direct ID (if the target element itself has an ID)
  if (pathArray[0].id) {
    selectors.push(`#${escapeCSS(pathArray[0].id)}`)
  }

  // 2. nth-child from nearest ancestor ID
  if (lowestId && lowestIdIndex > 0) {
    const fromId = nthChildParts.slice(0, lowestIdIndex).reverse().join(">")
    selectors.push(`#${escapeCSS(lowestId)}>${fromId}`)
  }

  // 3. Full nth-child from BODY
  const fullNthChild = "BODY>" + nthChildParts.reverse().join(">")
  nthChildParts.reverse() // restore order
  selectors.push(fullNthChild)

  // 4. Class-name path from BODY
  const fullClassName = "BODY>" + classNameParts.reverse().join(">")
  selectors.push(fullClassName)

  return selectors.length > 0 ? selectors : null
}
