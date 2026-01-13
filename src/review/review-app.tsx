// ReviewApp - TUI component for AI-powered diff review

import * as React from "react"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { MacOSScrollAccel } from "@opentui/core"
import { getResolvedTheme, defaultThemeName, rgbaToHex } from "../themes.ts"
import { detectFiletype, countChanges, getViewMode } from "../diff-utils.ts"
import { DiffView } from "../components/diff-view.tsx"
import { watchReviewYaml } from "./yaml-watcher.ts"
import type { IndexedHunk, ReviewYaml } from "./types.ts"

export interface ReviewAppProps {
  hunks: IndexedHunk[]
  yamlPath: string
  themeName?: string
  isGenerating: boolean
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
}: ReviewAppProps) {
  const { width } = useTerminalDimensions()
  const renderer = useRenderer()
  const [scrollAcceleration] = React.useState(() => new ScrollAcceleration())
  const [reviewData, setReviewData] = React.useState<ReviewYaml | null>(null)
  const [currentGroupIndex, setCurrentGroupIndex] = React.useState(0)

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

  // Keyboard navigation
  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "q") {
      renderer.destroy()
      return
    }

    if (key.name === "j" || key.name === "down") {
      if (reviewData && reviewData.hunks.length > 0) {
        setCurrentGroupIndex((i) => Math.min(i + 1, reviewData.hunks.length - 1))
      }
    }

    if (key.name === "k" || key.name === "up") {
      setCurrentGroupIndex((i) => Math.max(i - 1, 0))
    }

    if (key.option) {
      if (key.eventType === "release") {
        scrollAcceleration.multiplier = 1
      } else {
        scrollAcceleration.multiplier = 10
      }
    }
  })

  return (
    <ReviewAppView
      hunks={hunks}
      reviewData={reviewData}
      currentGroupIndex={currentGroupIndex}
      isGenerating={isGenerating}
      themeName={themeName}
      width={width}
      scrollAcceleration={scrollAcceleration}
    />
  )
}

/**
 * Props for the pure view component (used for testing)
 */
export interface ReviewAppViewProps {
  hunks: IndexedHunk[]
  reviewData: ReviewYaml | null
  currentGroupIndex: number
  isGenerating: boolean
  themeName: string
  width: number
  scrollAcceleration?: { tick: (delta: number) => number; reset: () => void }
}

/**
 * Pure view component - renders the review UI without any hooks
 * This component is exported for testing purposes
 */
export function ReviewAppView({
  hunks,
  reviewData,
  currentGroupIndex,
  isGenerating,
  themeName,
  width,
  scrollAcceleration,
}: ReviewAppViewProps) {
  // Create a map of hunk ID to hunk for quick lookup
  const hunkMap = React.useMemo(() => new Map(hunks.map((h) => [h.id, h])), [hunks])

  const resolvedTheme = getResolvedTheme(themeName)
  const bgColor = resolvedTheme.background

  // Loading state - waiting for data
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
        <text fg="#666666">
          {isGenerating ? "Waiting for AI to generate review..." : ""}
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
        <text fg={rgbaToHex(resolvedTheme.text)}>
          {isGenerating ? "Generating review..." : "No review groups generated"}
        </text>
      </box>
    )
  }

  const groups = reviewData.hunks
  const currentGroup = groups[currentGroupIndex]

  if (!currentGroup) {
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

  // Get the hunks for the current group
  const groupHunks = currentGroup.hunkIds
    .map((id) => hunkMap.get(id))
    .filter((h): h is IndexedHunk => h !== undefined)

  return (
    <box
      style={{
        flexDirection: "column",
        height: "100%",
        padding: 1,
        backgroundColor: bgColor,
      }}
    >
      {/* Scrollable content */}
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
          {/* Markdown description */}
          <MarkdownBlock
            content={currentGroup.markdownDescription}
            theme={resolvedTheme}
            width={width}
          />

          {/* Hunks */}
          {groupHunks.map((hunk, idx) => (
            <box key={hunk.id}>
              <HunkView
                hunk={hunk}
                themeName={themeName}
                width={width}
                isLast={idx === groupHunks.length - 1}
              />
            </box>
          ))}
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
        <text fg="#ffffff">{"<-"}</text>
        <text fg="#666666"> prev</text>
        <box flexGrow={1} />
        <text fg="#ffffff">q</text>
        <text fg="#666666"> quit  </text>
        <text fg="#ffffff">j/k</text>
        <text fg="#666666"> navigate  </text>
        <text fg="#666666">
          ({currentGroupIndex + 1}/{groups.length})
        </text>
        <box flexGrow={1} />
        <text fg="#666666">next </text>
        <text fg="#ffffff">{"->"}</text>
      </box>
    </box>
  )
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
