// Shared DiffView component for rendering git diffs with syntax highlighting

import * as React from "react"
import { SyntaxStyle } from "@opentui/core"
import { getSyntaxTheme, getResolvedTheme } from "../themes.ts"

export interface DiffViewProps {
  diff: string
  view: "split" | "unified"
  filetype?: string
  themeName: string
}

export function DiffView({ diff, view, filetype, themeName }: DiffViewProps) {
  const syntaxTheme = getSyntaxTheme(themeName)
  const resolvedTheme = getResolvedTheme(themeName)
  const syntaxStyle = React.useMemo(
    () => SyntaxStyle.fromStyles(syntaxTheme),
    [themeName],
  )

  return (
    <diff
      diff={diff}
      view={view}
      treeSitterClient={undefined}
      filetype={filetype}
      syntaxStyle={syntaxStyle}
      showLineNumbers
      wrapMode="word"
      addedContentBg={resolvedTheme.diffAddedBg}
      removedContentBg={resolvedTheme.diffRemovedBg}
      contextContentBg={resolvedTheme.backgroundPanel}
      lineNumberFg={resolvedTheme.diffLineNumber}
      lineNumberBg={resolvedTheme.backgroundPanel}
      addedLineNumberBg={resolvedTheme.diffAddedLineNumberBg}
      removedLineNumberBg={resolvedTheme.diffRemovedLineNumberBg}
      selectionBg="#264F78"
      selectionFg="#FFFFFF"
    />
  )
}
