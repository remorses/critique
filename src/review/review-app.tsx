// ReviewApp - Main TUI component for AI-powered diff review.
// Renders streaming review content with markdown descriptions and diff hunks.
// Supports live generation updates, theme switching, and resume from saved reviews.

import * as React from "react"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { MacOSScrollAccel, SyntaxStyle, BoxRenderable, CodeRenderable, TextRenderable, ScrollBoxRenderable } from "@opentui/core"
import type { Token } from "marked"
import { getResolvedTheme, getSyntaxTheme, defaultThemeName, themeNames, rgbaToHex } from "../themes.ts"
import { detectFiletype, countChanges, getViewMode } from "../diff-utils.ts"
import { DiffView, DirectoryTreeView } from "../components/index.ts"
import type { TreeFileInfo } from "../directory-tree.ts"
import { watchReviewYaml } from "./yaml-watcher.ts"
import { createSubHunk } from "./hunk-parser.ts"
import { parseDiagram } from "./diagram-parser.ts"
import { useAppStore } from "../store.ts"
import Dropdown from "../dropdown.tsx"
import type { IndexedHunk, ReviewYaml, ReviewGroup } from "./types.ts"

export interface ReviewAppProps {
  hunks: IndexedHunk[]
  yamlPath: string
  isGenerating: boolean
  initialReviewData?: ReviewYaml // For resume mode - skip YAML watching
}

class ScrollAcceleration {
  public multiplier: number = 1
  private macosAccel: MacOSScrollAccel
  constructor() {
    this.macosAccel = new MacOSScrollAccel({ A: 1.5, maxMultiplier: 10 })
  }
  tick(delta: number) {
    return this.macosAccel.tick(delta) * this.multiplier
  }
  reset() {
    this.macosAccel.reset()
  }
}

/**
 * Main ReviewApp component - wraps ReviewAppView with hooks for runtime use
 */
export function ReviewApp({
  hunks,
  yamlPath,
  isGenerating,
  initialReviewData,
}: ReviewAppProps) {
  const { width } = useTerminalDimensions()
  const renderer = useRenderer()
  const [reviewData, setReviewData] = React.useState<ReviewYaml | null>(initialReviewData ?? null)
  const [showThemePicker, setShowThemePicker] = React.useState(false)
  const [previewTheme, setPreviewTheme] = React.useState<string | null>(null)

  // Refs for vim-style scroll navigation
  const scrollboxRef = React.useRef<ScrollBoxRenderable | null>(null)
  const lastKeyRef = React.useRef<{ key: string; time: number } | null>(null)

  // Get theme from store
  const themeName = useAppStore((s) => s.themeName)
  // Use preview theme if hovering, otherwise use selected theme
  const activeTheme = previewTheme ?? themeName

  // Watch YAML file for updates (skip if initialReviewData provided - resume mode)
  React.useEffect(() => {
    if (initialReviewData) return // Resume mode - data already loaded

    const cleanup = watchReviewYaml(
      yamlPath,
      (yaml) => {
        setReviewData(yaml)
      },
      (error) => {
        console.error("YAML parse error:", error)
      },
    )
    return cleanup
  }, [yamlPath, initialReviewData])

  // Keyboard navigation
  useKeyboard((key) => {
    // Ctrl+Z toggles debug console
    if (key.ctrl && key.name === "z") {
      renderer.console.toggle()
      return
    }

    if (showThemePicker) {
      if (key.name === "escape") {
        setShowThemePicker(false)
        setPreviewTheme(null)
      }
      return
    }

    if (key.name === "escape" || key.name === "q") {
      renderer.destroy()
      return
    }

    if (key.name === "t") {
      setShowThemePicker(true)
      return
    }

    // Vim-style scroll navigation
    const scrollbox = scrollboxRef.current
    if (scrollbox) {
      // G - go to bottom
      if (key.name === "g" && key.shift) {
        scrollbox.scrollBy(1, "content")
        return
      }

      // gg - go to top (double-tap within 300ms)
      if (key.name === "g" && !key.shift && !key.ctrl) {
        const now = Date.now()
        if (lastKeyRef.current?.key === "g" && now - lastKeyRef.current.time < 300) {
          scrollbox.scrollTo(0)
          lastKeyRef.current = null
        } else {
          lastKeyRef.current = { key: "g", time: now }
        }
        return
      }

      // Ctrl+D - half page down
      if (key.ctrl && key.name === "d") {
        scrollbox.scrollBy(0.5, "viewport")
        return
      }

      // Ctrl+U - half page up
      if (key.ctrl && key.name === "u") {
        scrollbox.scrollBy(-0.5, "viewport")
        return
      }
    }
  })

  const themeOptions = themeNames.map((name) => ({
    title: name,
    value: name,
  }))

  const handleThemeSelect = (value: string) => {
    useAppStore.setState({ themeName: value })
    setShowThemePicker(false)
    setPreviewTheme(null)
  }

  const handleThemeFocus = (value: string) => {
    setPreviewTheme(value)
  }

  const resolvedTheme = getResolvedTheme(activeTheme)
  const bgColor = resolvedTheme.background

  // Theme picker mode
  if (showThemePicker) {
    return (
      <box
        style={{
          flexDirection: "column",
          height: "100%",
          padding: 1,
          backgroundColor: bgColor,
        }}
      >
        <box style={{ flexShrink: 0, maxHeight: 15 }}>
          <Dropdown
            tooltip="Select theme"
            options={themeOptions}
            selectedValues={[themeName]}
            onChange={handleThemeSelect}
            onFocus={handleThemeFocus}
            placeholder="Search themes..."
            itemsPerPage={6}
            theme={resolvedTheme}
          />
        </box>
        <scrollbox
          style={{
            flexGrow: 1,
            rootOptions: {
              backgroundColor: bgColor,
              border: false,
            },
            contentOptions: {
              minHeight: 0,
            },
          }}
        >
          <ReviewAppView
            hunks={hunks}
            reviewData={reviewData}
            isGenerating={isGenerating}
            themeName={activeTheme}
            width={width}
            showFooter={false}
            renderer={renderer}
          />
        </scrollbox>
      </box>
    )
  }

  return (
    <ReviewAppView
      hunks={hunks}
      reviewData={reviewData}
      isGenerating={isGenerating}
      themeName={activeTheme}
      width={width}
      renderer={renderer}
      scrollboxRef={scrollboxRef}
    />
  )
}

/**
 * Inline generating indicator with spinner and animated dots
 */
function GeneratingIndicatorInline({ color }: { color: string }) {
  const [phase, setPhase] = React.useState(0)

  React.useEffect(() => {
    const interval = setInterval(() => {
      setPhase((p) => (p + 1) % 12)
    }, 100)
    return () => clearInterval(interval)
  }, [])

  // Braille spinner pattern (cycles every 8 phases)
  const spinnerChars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧"]
  const spinner = spinnerChars[phase % 8]
  // Dots cycle every 4 phases (so they change ~3x slower than spinner)
  const dotCount = Math.floor(phase / 3) % 4
  const dots = ".".repeat(dotCount).padEnd(3, " ")

  return <text fg={color}>{spinner} generating{dots}</text>
}

/**
 * Centered generating indicator for loading state (when no content yet)
 */
function GeneratingIndicator({ color, bgColor }: { color: string; bgColor: string }) {
  return (
    <box
      style={{
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bgColor,
      }}
    >
      <GeneratingIndicatorInline color={color} />
    </box>
  )
}

/**
 * Props for the pure view component (used for testing)
 */
export interface ReviewAppViewProps {
  hunks: IndexedHunk[]
  reviewData: ReviewYaml | null
  isGenerating: boolean
  themeName?: string
  width: number
  showFooter?: boolean // defaults to true, set false for web rendering
  renderer?: any // Optional renderer for variable-width markdown
  gap?: number // Gap between markdown descriptions and hunks (default: 2)
  scrollboxRef?: React.RefObject<ScrollBoxRenderable | null> // For vim-style navigation
}

/**
 * Pure view component - renders the review UI without any hooks
 * This component is exported for testing purposes
 */
export function ReviewAppView({
  hunks,
  reviewData,
  isGenerating,
  themeName = defaultThemeName,
  width,
  showFooter = true,
  renderer,
  gap = 2,
  scrollboxRef,
}: ReviewAppViewProps) {
  const [scrollAcceleration] = React.useState(() => new ScrollAcceleration())

  // Create a map of hunk ID to hunk for quick lookup
  const hunkMap = React.useMemo(() => new Map(hunks.map((h) => [h.id, h])), [hunks])

  // Build tree data from all hunks, grouped by filename
  // Aggregates additions/deletions per file
  const treeFiles: TreeFileInfo[] = React.useMemo(() => {
    const fileMap = new Map<string, { additions: number; deletions: number; firstIndex: number }>()
    
    for (let i = 0; i < hunks.length; i++) {
      const hunk = hunks[i]!
      const existing = fileMap.get(hunk.filename)
      const { additions, deletions } = countChanges([{ lines: hunk.lines }])
      
      if (existing) {
        existing.additions += additions
        existing.deletions += deletions
      } else {
        fileMap.set(hunk.filename, { additions, deletions, firstIndex: i })
      }
    }
    
    // Determine status for each file (simplified: all are modified in review context)
    // In practice, we could look at the hunk headers for more accurate status
    const result: TreeFileInfo[] = []
    for (const [filename, data] of fileMap) {
      let status: "added" | "modified" | "deleted" = "modified"
      if (data.deletions === 0 && data.additions > 0) status = "added"
      else if (data.additions === 0 && data.deletions > 0) status = "deleted"
      
      result.push({
        path: filename,
        status,
        additions: data.additions,
        deletions: data.deletions,
        fileIndex: data.firstIndex,
      })
    }
    return result
  }, [hunks])

  const resolvedTheme = getResolvedTheme(themeName)
  const bgColor = rgbaToHex(resolvedTheme.background)

  // Loading state - TUI now only starts after YAML is parsed, so this is a fallback
  if (!reviewData) {
    return (
      <box
        style={{
          flexDirection: "column",
          height: "100%",
          padding: 1,
          backgroundColor: bgColor,
        }}
      >
        <text fg={rgbaToHex(resolvedTheme.text)}>
          Loading review...
        </text>
      </box>
    )
  }

  // No groups generated
  if (reviewData.hunks.length === 0) {
    return (
      <box
        style={{
          flexDirection: "column",
          height: "100%",
          padding: 1,
          backgroundColor: bgColor,
        }}
      >
        {isGenerating ? (
          <GeneratingIndicator
            color={rgbaToHex(resolvedTheme.textMuted)}
            bgColor={bgColor}
          />
        ) : (
          <text fg={rgbaToHex(resolvedTheme.text)}>No review groups generated</text>
        )}
      </box>
    )
  }

  const groups = reviewData.hunks

  if (groups.length === 0) {
    return (
      <box
        style={{
          flexDirection: "column",
          flexGrow: 1,
          padding: 1,
          backgroundColor: bgColor,
        }}
      >
        <text fg={rgbaToHex(resolvedTheme.text)}>No review groups found</text>
      </box>
    )
  }

  return (
    <box
      style={{
        flexDirection: "column",
        flexGrow: 1,
        padding: 1,
        backgroundColor: bgColor,
      }}
    >
      {/* Scrollable content - shows ALL groups */}
      <scrollbox
        ref={scrollboxRef}
        scrollAcceleration={scrollAcceleration}
        style={{
          flexGrow: 1,
          flexShrink: 1,
          rootOptions: {
            backgroundColor: bgColor,
            border: false,
          },
          contentOptions: {
            minHeight: 0, // let scrollbox shrink with content for web rendering
          },
          scrollbarOptions: {
            showArrows: false,
            trackOptions: {
              foregroundColor: rgbaToHex(resolvedTheme.textMuted),
              backgroundColor: bgColor,
            },
          },
        }}
        focused
      >
        <box style={{ flexDirection: "column" }}>
          {/* Directory tree at the top - updates as hunks arrive */}
          {treeFiles.length > 0 && (
            <box style={{ marginBottom: gap }}>
              <DirectoryTreeView
                files={treeFiles}
                themeName={themeName}
              />
            </box>
          )}

          {groups.map((group, groupIdx) => {
            // Resolve hunks from group - supports both hunkIds and hunkId with lineRange
            const groupHunks = resolveGroupHunks(group, hunkMap)

            return (
              <box key={groupIdx} style={{ flexDirection: "column", marginBottom: gap }}>
                {/* Markdown description */}
                <box style={{ marginBottom: gap }}>
                  <MarkdownBlock
                    content={group.markdownDescription}
                    themeName={themeName}
                    width={width}
                    renderer={renderer}
                  />
                </box>

                {/* Hunks */}
                {groupHunks.map((hunk, idx) => (
                  <box key={`${hunk.id}-${idx}`} style={{ alignItems: "center" }}>
                    <HunkView
                      hunk={hunk}
                      themeName={themeName}
                      width={width}
                      isLast={idx === groupHunks.length - 1}
                    />
                  </box>
                ))}
              </box>
            )
          })}
          {/* Generating indicator - shown below last hunk */}
          {isGenerating && (
            <box style={{ alignItems: "center", justifyContent: "center", marginTop: gap, marginBottom: gap }}>
              <GeneratingIndicatorInline color={rgbaToHex(resolvedTheme.textMuted)} />
            </box>
          )}
        </box>
      </scrollbox>

      {/* Footer - hidden in web mode */}
      {showFooter && (
        <box
          style={{
            paddingTop: 1,
            paddingLeft: 1,
            paddingRight: 1,
            flexShrink: 0,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <text fg={rgbaToHex(resolvedTheme.textMuted)}>
            ({groups.length} section{groups.length !== 1 ? "s" : ""})
          </text>
          <text fg={rgbaToHex(resolvedTheme.textMuted)}>  </text>
          <text fg={rgbaToHex(resolvedTheme.text)}>t</text>
          <text fg={rgbaToHex(resolvedTheme.textMuted)}> theme</text>
          <box flexGrow={1} />
          <text fg={rgbaToHex(resolvedTheme.textMuted)}>run with </text>
          <text fg={rgbaToHex(resolvedTheme.text)}><b>--web</b></text>
          <text fg={rgbaToHex(resolvedTheme.textMuted)}> to share & collaborate</text>
        </box>
      )}
    </box>
  )
}

/**
 * Resolve hunks from a ReviewGroup
 * Supports both full hunks (hunkIds) and partial hunks (hunkId + lineRange)
 * Note: lineRange from AI uses 1-based line numbers (like cat -n), converted to 0-based internally
 */
function resolveGroupHunks(
  group: ReviewGroup,
  hunkMap: Map<number, IndexedHunk>,
): IndexedHunk[] {
  const result: IndexedHunk[] = []

  // Handle hunkIds (full hunks)
  if (group.hunkIds) {
    for (const id of group.hunkIds) {
      const hunk = hunkMap.get(id)
      if (hunk) {
        result.push(hunk)
      }
    }
  }

  // Handle single hunkId with optional lineRange
  if (group.hunkId !== undefined) {
    const hunk = hunkMap.get(group.hunkId)
    if (hunk) {
      if (group.lineRange) {
        // Convert from 1-based (AI/cat -n format) to 0-based (internal)
        const startLine = group.lineRange[0] - 1
        const endLine = group.lineRange[1] - 1

        // Create a sub-hunk for the specified line range
        try {
          const subHunk = createSubHunk(hunk, startLine, endLine)
          result.push(subHunk)
        } catch {
          // If sub-hunk creation fails, fall back to full hunk
          result.push(hunk)
        }
      } else {
        // No line range, use full hunk
        result.push(hunk)
      }
    }
  }

  return result
}

interface MarkdownBlockProps {
  content: string
  themeName: string
  width: number
  renderer?: any // Optional renderer for variable-width feature
}

function MarkdownBlock({ content, themeName, width, renderer }: MarkdownBlockProps) {
  const syntaxTheme = getSyntaxTheme(themeName)
  const syntaxStyle = React.useMemo(
    () => SyntaxStyle.fromStyles(syntaxTheme),
    [syntaxTheme],
  )
  const resolvedTheme = getResolvedTheme(themeName)
  const textColor = rgbaToHex(resolvedTheme.text)
  const concealColor = rgbaToHex(resolvedTheme.conceal)
  const diagramTextColor = rgbaToHex(resolvedTheme.markdownBlockQuote ?? resolvedTheme.text)

  // Max width for prose (constrained), code blocks use full terminal width
  const maxProseWidth = Math.min(80, width)

  // Custom renderNode to wrap all elements in centered boxes
  // Prose elements are constrained to maxProseWidth, code/tables use full width
  // Only enabled when renderer is available
  const renderNode = React.useMemo(() => {
    if (!renderer) return undefined

    let nodeCounter = 0
    return (token: Token, context: { defaultRender: () => any }) => {
      const defaultRenderable = context.defaultRender()
      if (!defaultRenderable) return null

      // Prose: constrained to maxProseWidth, centered
      if (["heading", "paragraph", "list", "blockquote"].includes(token.type)) {
        const wrapper = new BoxRenderable(renderer, {
          id: `prose-wrapper-${nodeCounter++}`,
          maxWidth: maxProseWidth,
          width: "100%",
          alignSelf: "center",
        })
        wrapper.add(defaultRenderable)
        return wrapper
      }

      // Code blocks: create custom CodeRenderable with wrapMode: "none" and overflow: "hidden"
      if (token.type === "code") {
        const codeToken = token as { text: string; lang?: string }


        const wrapper = new BoxRenderable(renderer, {
          id: `code-wrapper-${nodeCounter++}`,
          alignSelf: "center",
          overflow: "hidden",
        })

        // Special handling for diagram language - color structural chars as muted
        if (codeToken.lang === "diagram") {
          console.log("[diagram-debug] MATCHED diagram lang, parsing...")
          const diagramWrapper = new BoxRenderable(renderer, {
            id: `diagram-${nodeCounter++}`,
            flexDirection: "column",
          })
          const parsedLines = parseDiagram(codeToken.text)
          for (let i = 0; i < parsedLines.length; i++) {
            const line = parsedLines[i]!
            // Skip empty lines or add a single space to maintain line height
            if (line.segments.length === 0) {
              const emptyLine = new TextRenderable(renderer, {
                id: `diagram-empty-${nodeCounter++}-${i}`,
                content: " ",
                fg: concealColor,
              })
              diagramWrapper.add(emptyLine)
              continue
            }
            // Create a row box for each line
            const lineBox = new BoxRenderable(renderer, {
              id: `diagram-line-${nodeCounter++}-${i}`,
              flexDirection: "row",
            })
            // Add each segment as a separate text renderable with appropriate color
            for (let j = 0; j < line.segments.length; j++) {
              const segment = line.segments[j]!
              const segmentRenderable = new TextRenderable(renderer, {
                id: `diagram-seg-${nodeCounter++}-${i}-${j}`,
                content: segment.text,
                fg: segment.type === "muted" ? concealColor : diagramTextColor,
              })
              lineBox.add(segmentRenderable)
            }
            diagramWrapper.add(lineBox)
          }
          wrapper.add(diagramWrapper)
          return wrapper
        }

        const codeRenderable = new CodeRenderable(renderer, {
          id: `code-${nodeCounter++}`,
          content: codeToken.text,
          filetype: codeToken.lang || undefined,
          syntaxStyle,
          drawUnstyledText: false,
          wrapMode: "none",
          overflow: "hidden",
          // width: "100%",
        })
        wrapper.add(codeRenderable)
        return wrapper
      }

      // Tables: centered but can use full width
      if (token.type === "table") {
        const wrapper = new BoxRenderable(renderer, {
          id: `table-wrapper-${nodeCounter++}`,
          alignSelf: "center",
        })
        wrapper.add(defaultRenderable)
        return wrapper
      }

      // Other elements (hr, space, etc.) use default rendering
      return undefined
    }
  }, [renderer, maxProseWidth, syntaxStyle, textColor, concealColor, diagramTextColor])

  // Use very large width when renderer available so code blocks don't wrap
  // Prose is constrained via renderNode, code blocks can overflow
  const contentWidth = renderer ? 1000 : Math.min(width - 4, maxProseWidth)

  return (
    <box
      style={{
        flexDirection: "column",
        width: "100%",
        alignItems: "center",
      }}
    >
      <markdown
        content={content}
        syntaxStyle={syntaxStyle}
        renderNode={renderNode}
        style={{
          width: contentWidth,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      />
    </box>
  )
}

export interface HunkViewProps {
  hunk: IndexedHunk
  themeName: string
  width: number
  isLast: boolean
}

export function HunkView({ hunk, themeName, width, isLast }: HunkViewProps) {
  const resolvedTheme = getResolvedTheme(themeName)
  const filetype = detectFiletype(hunk.filename)
  const { additions, deletions } = countChanges([{ lines: hunk.lines }])
  const viewMode = getViewMode(additions, deletions, width)

  return (
    <box style={{ flexDirection: "column", marginBottom: isLast ? 0 : 1 }}>
      {/* Hunk header */}
      <box
        style={{
          paddingLeft: 1,
          paddingRight: 1,
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 1,
        }}
      >
        <text fg={rgbaToHex(resolvedTheme.text)}><b>{hunk.filename}</b></text>
        <text fg={rgbaToHex(resolvedTheme.syntaxString)}> +{additions}</text>
        <text fg={rgbaToHex(resolvedTheme.syntaxVariable)}>-{deletions}</text>
      </box>

      {/* Diff view - uses shared component */}
      <DiffView
        diff={hunk.rawDiff}
        view={viewMode}
        filetype={filetype}
        themeName={themeName}
      />
    </box>
  )
}
