// Shared DiffView component for rendering git diffs with syntax highlighting.
// Wraps opentui's <diff> element with theme-aware colors and syntax styles.
// Supports split and unified view modes with line numbers.

import * as React from "react"
import { SyntaxStyle } from "@opentui/core"
import { getSyntaxTheme, getResolvedTheme, rgbaToHex } from "../themes.ts"

export interface DiffViewProps {
  diff: string
  view: "split" | "unified"
  filetype?: string
  themeName: string
  /** Wrap mode for long lines (default: "word") */
  wrapMode?: "word" | "char" | "none"
}

export function DiffView({ diff, view, filetype, themeName, wrapMode = "word" }: DiffViewProps) {
  // Memoize theme lookups to ensure stable references
  const resolvedTheme = React.useMemo(
    () => getResolvedTheme(themeName),
    [themeName],
  )
  const syntaxStyle = React.useMemo(
    () => SyntaxStyle.fromStyles(getSyntaxTheme(themeName)),
    [themeName],
  )

  // Convert RGBA to hex for diff component props
  const colors = React.useMemo(() => ({
    bgPanel: rgbaToHex(resolvedTheme.backgroundPanel),
    diffAddedBg: rgbaToHex(resolvedTheme.diffAddedBg),
    diffRemovedBg: rgbaToHex(resolvedTheme.diffRemovedBg),
    diffLineNumber: rgbaToHex(resolvedTheme.diffLineNumber),
    diffAddedLineNumberBg: rgbaToHex(resolvedTheme.diffAddedLineNumberBg),
    diffRemovedLineNumberBg: rgbaToHex(resolvedTheme.diffRemovedLineNumberBg),
  }), [resolvedTheme])

  return (
    <box key={themeName} style={{ backgroundColor: colors.bgPanel }}>
      <diff
        diff={diff}
        view={view}
        treeSitterClient={undefined}
        filetype={filetype}
        syntaxStyle={syntaxStyle}
        showLineNumbers
        wrapMode={wrapMode}
        addedContentBg={colors.diffAddedBg}
        removedContentBg={colors.diffRemovedBg}
        contextContentBg={colors.bgPanel}
        lineNumberFg={colors.diffLineNumber}
        lineNumberBg={colors.bgPanel}
        addedLineNumberBg={colors.diffAddedLineNumberBg}
        removedLineNumberBg={colors.diffRemovedLineNumberBg}
        selectionBg="#264F78"
        selectionFg="#FFFFFF"
      />
    </box>
  )
}
