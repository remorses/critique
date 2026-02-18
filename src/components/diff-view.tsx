// Shared DiffView component for rendering git diffs with syntax highlighting.
// Wraps opentui's <diff> element with theme-aware colors and syntax styles.
// Supports split and unified view modes with line numbers.

import * as React from "react"
import { SyntaxStyle } from "@opentuah/core"
import { getSyntaxTheme, getResolvedTheme, rgbaToHex } from "../themes.ts"
import { balanceBackticks } from "../balance-backticks.ts"

export interface DiffViewProps {
  diff: string
  view: "split" | "unified"
  filetype?: string
  themeName: string
  /** Wrap mode for long lines (default: "word") */
  wrapMode?: "word" | "char" | "none"
}

export function DiffView({ diff, view, filetype, themeName, wrapMode = "word" }: DiffViewProps) {
  // Balance backticks before passing to <diff> so tree-sitter doesn't
  // misparse hunks that start inside a template literal
  const balancedDiff = React.useMemo(
    () => balanceBackticks(diff, filetype),
    [diff, filetype],
  )

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
    text: rgbaToHex(resolvedTheme.text),
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
        diff={balancedDiff}
        view={view}
        fg={colors.text}
        treeSitterClient={undefined}
        filetype={filetype}
        syntaxStyle={syntaxStyle}
        showLineNumbers
        wrapMode={wrapMode}
        // `addedBg`/`removedBg` are used by opentui as the base colors for word-level highlights.
        // We set them to match the content backgrounds so light themes don't inherit dark defaults.
        addedBg={colors.diffAddedBg}
        removedBg={colors.diffRemovedBg}
        contextBg={colors.bgPanel}
        // github-light's diffAddedBg is already quite pale, so a small explicit boost keeps
        // word highlights visible without relying on internal defaults.
        addedWordBg={themeName === "github-light" ? "#acf2bd" : undefined}
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
