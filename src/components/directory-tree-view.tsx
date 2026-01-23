// DirectoryTreeView - Renders a directory tree with file status colors and change counts.
// Shows added files in green, modified in orange, deleted in red.
// Change counts (+n,-n) use green/red for the numbers, brackets are muted.
// Supports click-to-scroll via onFileSelect callback.

import * as React from "react"
import { buildDirectoryTree, type TreeFileInfo, type TreeNode } from "../directory-tree.ts"
import { getResolvedTheme, rgbaToHex } from "../themes.ts"

export interface DirectoryTreeViewProps {
  /** Files to display in the tree */
  files: TreeFileInfo[]
  /** Callback when a file is clicked (receives fileIndex) */
  onFileSelect?: (fileIndex: number) => void
  /** Theme name for colors */
  themeName: string
}

/**
 * Get the color for a file based on its status
 * Uses diff colors from theme: green (added), red (deleted), default text (modified)
 */
function getStatusColor(status: "added" | "modified" | "deleted", theme: ReturnType<typeof getResolvedTheme>): string {
  switch (status) {
    case "added":
      return rgbaToHex(theme.diffAdded) // green
    case "deleted":
      return rgbaToHex(theme.diffRemoved) // red
    case "modified":
      return rgbaToHex(theme.text) // default text color, same as folders
  }
}

/**
 * Render a single tree node line with proper colors
 */
function TreeNodeLine({
  node,
  theme,
  mutedColor,
  textColor,
  onSelect,
}: {
  node: TreeNode
  theme: ReturnType<typeof getResolvedTheme>
  mutedColor: string
  textColor: string
  onSelect?: () => void
}) {
  const [isHovered, setIsHovered] = React.useState(false)

  if (node.isFile) {
    // File node - colorize based on status
    const pathColor = node.status ? getStatusColor(node.status, theme) : textColor
    const addColor = rgbaToHex(theme.diffAdded) // green
    const delColor = rgbaToHex(theme.diffRemoved) // red
    const hasAdditions = (node.additions ?? 0) > 0
    const hasDeletions = (node.deletions ?? 0) > 0

    return (
      <box
        style={{
          flexDirection: "row",
          backgroundColor: isHovered ? rgbaToHex(theme.backgroundPanel) : undefined,
        }}
        onMouseMove={() => setIsHovered(true)}
        onMouseOut={() => setIsHovered(false)}
        onMouseDown={onSelect}
      >
        <text fg={mutedColor}>{node.prefix}{node.connector}</text>
        <text fg={pathColor}>{node.displayPath}</text>
        <text fg={mutedColor}> (</text>
        {hasAdditions && <text fg={addColor}>+{node.additions}</text>}
        {hasAdditions && hasDeletions && <text fg={mutedColor}>,</text>}
        {hasDeletions && <text fg={delColor}>-{node.deletions}</text>}
        <text fg={mutedColor}>)</text>
      </box>
    )
  }

  // Directory node - use muted color for everything
  return (
    <box style={{ flexDirection: "row" }}>
      <text fg={mutedColor}>{node.prefix}{node.connector}</text>
      <text fg={textColor}>{node.displayPath}</text>
    </box>
  )
}

/**
 * DirectoryTreeView component
 * Renders a directory tree with file status colors and click-to-scroll support
 */
export function DirectoryTreeView({
  files,
  onFileSelect,
  themeName,
}: DirectoryTreeViewProps) {
  const nodes = React.useMemo(() => buildDirectoryTree(files), [files])
  const resolvedTheme = getResolvedTheme(themeName)
  const mutedColor = rgbaToHex(resolvedTheme.textMuted)
  const textColor = rgbaToHex(resolvedTheme.text)

  if (nodes.length === 0) {
    return null
  }

  return (
    <box
      style={{
        alignSelf: "center",
        flexDirection: "column",
      }}
    >
      {nodes.map((node, idx) => (
        <TreeNodeLine
          key={idx}
          node={node}
          theme={resolvedTheme}
          mutedColor={mutedColor}
          textColor={textColor}
          onSelect={
            node.isFile && node.fileIndex !== undefined && onFileSelect
              ? () => onFileSelect(node.fileIndex!)
              : undefined
          }
        />
      ))}
    </box>
  )
}
