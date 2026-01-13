// ReviewApp - TUI component for AI-powered diff review

import * as React from "react"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { MacOSScrollAccel } from "@opentui/core"
import { getResolvedTheme, defaultThemeName, rgbaToHex } from "../themes.ts"
import { detectFiletype, countChanges, getViewMode } from "../diff-utils.ts"
import { DiffView } from "../components/diff-view.tsx"
import { watchReviewYaml } from "./yaml-watcher.ts"
import { createSubHunk } from "./hunk-parser.ts"
import { StreamDisplay } from "./stream-display.tsx"
import type { SessionNotification } from "@agentclientprotocol/sdk"
import type { IndexedHunk, ReviewYaml, ReviewGroup } from "./types.ts"

export interface ReviewAppProps {
  hunks: IndexedHunk[]
  yamlPath: string
  themeName?: string
  isGenerating: boolean
  subscribeToNotifications?: (callback: (notifications: SessionNotification[]) => void) => () => void
}

class ScrollAcceleration {
  public multiplier: number = 1
  private macosAccel: MacOSScrollAccel
  constructor() {
    this.macosAccel = new MacOSScrollAccel()
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
  themeName = defaultThemeName,
  isGenerating,
  subscribeToNotifications,
}: ReviewAppProps) {
  const { width } = useTerminalDimensions()
  const renderer = useRenderer()
  const [reviewData, setReviewData] = React.useState<ReviewYaml | null>(null)
  const [notifications, setNotifications] = React.useState<SessionNotification[]>([])

  // Watch YAML file for updates
  React.useEffect(() => {
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
  }, [yamlPath])

  // Subscribe to notification updates for real-time streaming
  React.useEffect(() => {
    if (!subscribeToNotifications) return
    
    const unsubscribe = subscribeToNotifications((newNotifications) => {
      setNotifications(newNotifications)
    })

    return unsubscribe
  }, [subscribeToNotifications])

  // Keyboard navigation - just quit, scrollbox handles scrolling
  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "q") {
      renderer.destroy()
      return
    }
  })

  return (
    <ReviewAppView
      hunks={hunks}
      reviewData={reviewData}
      isGenerating={isGenerating}
      themeName={themeName}
      width={width}
      notifications={notifications}
    />
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
  notifications?: SessionNotification[]
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
  notifications = [],
}: ReviewAppViewProps) {
  const [scrollAcceleration] = React.useState(() => new ScrollAcceleration())

  // Create a map of hunk ID to hunk for quick lookup
  const hunkMap = React.useMemo(() => new Map(hunks.map((h) => [h.id, h])), [hunks])

  const resolvedTheme = getResolvedTheme(themeName)
  const bgColor = resolvedTheme.background

  // Loading state - show streaming display while waiting for YAML
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
          Analyzing {hunks.length} hunks...
        </text>
        {notifications.length > 0 ? (
          <StreamDisplay
            notifications={notifications}
            themeName={themeName}
            width={width}
          />
        ) : (
          <text fg="#666666">
            {isGenerating ? "Waiting for AI to generate review..." : ""}
          </text>
        )}
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
        <text fg={rgbaToHex(resolvedTheme.text)}>
          {isGenerating ? "Generating review..." : "No review groups generated"}
        </text>
      </box>
    )
  }

  const groups = reviewData.hunks

  if (groups.length === 0) {
    return (
      <box
        style={{
          flexDirection: "column",
          height: "100%",
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
        height: "100%",
        padding: 1,
        backgroundColor: bgColor,
      }}
    >
      {/* Scrollable content - shows ALL groups */}
      <scrollbox
        scrollAcceleration={scrollAcceleration}
        style={{
          flexGrow: 1,
          rootOptions: {
            backgroundColor: bgColor,
            border: false,
          },
          scrollbarOptions: {
            showArrows: false,
            trackOptions: {
              foregroundColor: "#4a4a4a",
              backgroundColor: bgColor,
            },
          },
        }}
        focused
      >
        <box style={{ flexDirection: "column" }}>
          {groups.map((group, groupIdx) => {
            // Resolve hunks from group - supports both hunkIds and hunkId with lineRange
            const groupHunks = resolveGroupHunks(group, hunkMap)

            return (
              <box key={groupIdx} style={{ flexDirection: "column", marginBottom: groupIdx < groups.length - 1 ? 2 : 0 }}>
                {/* Markdown description */}
                <MarkdownBlock
                  content={group.markdownDescription}
                  theme={resolvedTheme}
                  width={width}
                />

                {/* Hunks */}
                {groupHunks.map((hunk, idx) => (
                  <box key={`${hunk.id}-${idx}`}>
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
        </box>
      </scrollbox>

      {/* Footer */}
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
        <box flexGrow={1} />
        <text fg="#ffffff">q</text>
        <text fg="#666666"> quit  </text>
        <text fg="#ffffff">j/k</text>
        <text fg="#666666"> scroll  </text>
        <text fg="#666666">
          ({groups.length} section{groups.length !== 1 ? "s" : ""})
        </text>
        <box flexGrow={1} />
      </box>
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
  theme: ReturnType<typeof getResolvedTheme>
  width: number
}

function MarkdownBlock({ content, theme, width }: MarkdownBlockProps) {
  // Simple markdown rendering - headers, bold, code
  const lines = content.split("\n")

  // Max width 80, centered
  const maxWidth = 80
  const contentWidth = Math.min(width - 4, maxWidth) // Account for padding
  const sidePadding = Math.max(1, Math.floor((width - contentWidth) / 2))

  return (
    <box
      style={{
        flexDirection: "column",
        width: "100%",
        alignItems: "center",
        paddingBottom: 1,
      }}
    >
      <box
        style={{
          flexDirection: "column",
          width: contentWidth,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        {lines.map((line, idx) => {
          // Headers - use brighter color for emphasis
          if (line.startsWith("## ")) {
            return (
              <text key={idx} fg="#ffffff">
                {line.slice(3)}
              </text>
            )
          }
          if (line.startsWith("# ")) {
            return (
              <text key={idx} fg="#ffffff">
                {line.slice(2)}
              </text>
            )
          }
          // Regular text
          return (
            <text key={idx} fg={rgbaToHex(theme.text)}>
              {line || " "}
            </text>
          )
        })}
      </box>
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
        }}
      >
        <text fg="#888888">#{hunk.id}</text>
        <text fg="#666666"> </text>
        <text fg={rgbaToHex(resolvedTheme.text)}>{hunk.filename}</text>
        <text fg="#00ff00"> +{additions}</text>
        <text fg="#ff0000">-{deletions}</text>
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
