// Shared DiffView component for rendering git diffs with syntax highlighting.
// Wraps opentui's <diff> element with theme-aware colors and syntax styles.
// Supports split and unified view modes with line numbers.

import * as React from "react"
import { RGBA, SyntaxStyle } from "@opentuah/core"
import { getSyntaxTheme, getResolvedTheme, rgbaToHex } from "../themes.ts"
import { balanceDelimiters } from "../balance-delimiters.ts"

export interface DiffViewProps {
  diff: string
  view: "split" | "unified"
  filetype?: string
  themeName: string
  /** Wrap mode for long lines (default: "word") */
  wrapMode?: "word" | "char" | "none"
}

function getLuminance(color: RGBA): number {
  return color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722
}

function getColorDistance(a: RGBA, b: RGBA): number {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/**
 * Compute a visible word-highlight color from a line background.
 * Uses stronger contrast than opentui's default brighten(1.1), which is too subtle
 * on very dark themes (especially in HTML screenshots/web output).
 */
function getWordHighlightBg(base: RGBA): string {
  const baseLuminance = getLuminance(base)

  // Light backgrounds: darken slightly while preserving hue.
  // This avoids chalky white patches that can look noisy.
  if (baseLuminance >= 0.52) {
    return rgbaToHex(base.brighten(0.9))
  }

  // Dark backgrounds: use stronger hue-preserving brightening than opentui default (1.1),
  // which is often imperceptible on near-black diff backgrounds.
  let candidate = base.brighten(2.4)
  let luminanceDelta = Math.abs(getLuminance(candidate) - baseLuminance)

  // Keep a minimum luminance delta close to github-light perceptibility.
  if (luminanceDelta < 0.09) {
    candidate = base.brighten(3.0)
    luminanceDelta = Math.abs(getLuminance(candidate) - baseLuminance)
  }

  if (luminanceDelta < 0.09) {
    candidate = base.brighten(3.6)
  }

  // Pure-black (or near-black) bases stay unchanged with multiplicative brighten.
  // Add a tiny additive lift so inline highlights remain visible on those themes.
  if (getColorDistance(candidate, base) < 0.03) {
    candidate = RGBA.fromValues(
      base.r + (1 - base.r) * 0.12,
      base.g + (1 - base.g) * 0.12,
      base.b + (1 - base.b) * 0.12,
      base.a,
    )
  }

  return rgbaToHex(candidate)
}

export function DiffView({ diff, view, filetype, themeName, wrapMode = "word" }: DiffViewProps) {
  // Balance paired delimiters (backticks, triple quotes, etc.) before
  // passing to <diff> so tree-sitter doesn't misparse hunks that start
  // inside a multi-line string
  const balancedDiff = React.useMemo(
    () => balanceDelimiters(diff, filetype),
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

  const wordHighlights = React.useMemo(() => ({
    addedWordBg: getWordHighlightBg(resolvedTheme.diffAddedBg),
    removedWordBg: getWordHighlightBg(resolvedTheme.diffRemovedBg),
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
        // Use explicit word highlight colors to avoid near-invisible defaults on dark themes.
        addedWordBg={wordHighlights.addedWordBg}
        removedWordBg={wordHighlights.removedWordBg}
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
