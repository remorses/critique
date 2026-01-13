// StreamDisplay - TUI component for showing ACP streaming events
// Displays agent activity while waiting for YAML to be parsed

import * as React from "react"
import { SyntaxStyle } from "@opentui/core"
import type { SessionNotification } from "@agentclientprotocol/sdk"
import { formatNotifications, SYMBOLS, COLORS, isEditTool, type StreamLine } from "./acp-stream-display.ts"
import { getSyntaxTheme, getResolvedTheme, rgbaToHex } from "../themes.ts"

export interface StreamDisplayProps {
  notifications: SessionNotification[]
  themeName?: string
  width?: number
}

/**
 * StreamDisplay component - shows streaming ACP events in a formatted list
 * 
 * Display format:
 * ┣ thinking
 * ⬥ markdown content (full, with syntax highlighting)
 * ┣ read file.ts
 * ◼︎ edit  file.yaml (+40-35)
 */
export function StreamDisplay({
  notifications,
  themeName = "github",
  width = 80,
}: StreamDisplayProps) {
  const lines = React.useMemo(
    () => formatNotifications(notifications),
    [notifications],
  )

  const resolvedTheme = getResolvedTheme(themeName)
  const syntaxTheme = getSyntaxTheme(themeName)
  const syntaxStyle = React.useMemo(
    () => SyntaxStyle.fromStyles(syntaxTheme),
    [syntaxTheme],
  )

  const bgColor = resolvedTheme.background

  if (lines.length === 0) {
    return (
      <box
        style={{
          flexDirection: "column",
          backgroundColor: bgColor,
        }}
      >
        <text fg={rgbaToHex(resolvedTheme.textMuted)}>
          Waiting for agent...
        </text>
      </box>
    )
  }

  return (
    <scrollbox
      style={{
        flexGrow: 1,
        flexDirection: "column",
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
    >
      <box style={{ flexDirection: "column" }}>
        {lines.map((line, idx) => (
          <box key={idx} style={{ flexDirection: "column" }}>
            <StreamLineView
              line={line}
              themeName={themeName}
              syntaxStyle={syntaxStyle}
              width={width}
            />
          </box>
        ))}
      </box>
    </scrollbox>
  )
}

interface StreamLineViewProps {
  line: StreamLine
  themeName: string
  syntaxStyle: SyntaxStyle
  width: number
}

function StreamLineView({ line, themeName, syntaxStyle, width }: StreamLineViewProps) {
  // Thinking blocks - just show "┣ thinking"
  if (line.type === "thinking") {
    return (
      <box style={{ flexDirection: "row" }}>
        <text fg={COLORS.thinking}>
          {SYMBOLS.thinking} thinking
        </text>
      </box>
    )
  }

  // Message blocks - show full markdown content with syntax highlighting
  if (line.type === "message") {
    return (
      <box style={{ flexDirection: "column" }}>
        <box style={{ flexDirection: "row" }}>
          <text fg={COLORS.text}>{SYMBOLS.text}</text>
        </box>
        <box style={{ flexDirection: "column", paddingLeft: 2 }}>
          <code
            content={line.text}
            filetype="markdown"
            syntaxStyle={syntaxStyle}
            style={{
              width: Math.max(10, width - 4),
            }}
          />
        </box>
      </box>
    )
  }

  // Tool calls
  if (line.type === "tool_call") {
    const toolKind = line.toolKind || line.text || ""
    const isEdit = isEditTool(toolKind)
    const isWrite = toolKind.toLowerCase().includes("write")
    const symbol = isEdit ? SYMBOLS.edit : SYMBOLS.toolCall
    const color = isEdit ? COLORS.edit : COLORS.toolCall

    let displayText = line.text
    
    // Only add filename if not already in the title
    const firstFile = line.files?.[0]
    if (firstFile) {
      const filename = firstFile.split("/").pop() || firstFile
      const titleHasFilename = line.text.includes(filename)
      
      if (isWrite) {
        displayText = `write ${filename}`
      } else if (isEdit) {
        displayText = `edit  ${filename}`
      } else if (!titleHasFilename) {
        displayText = `${line.text} ${filename}`
      }
    }
    
    if (isEdit && (line.additions !== undefined || line.deletions !== undefined)) {
      displayText += ` (+${line.additions || 0}-${line.deletions || 0})`
    }

    return (
      <box style={{ flexDirection: "row" }}>
        <text fg={color}>
          {symbol} {displayText}
        </text>
      </box>
    )
  }

  return null
}

export { type StreamLine }
