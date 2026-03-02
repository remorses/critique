// Directory tree builder for displaying file changes in a tree structure.
// Builds a collapsible tree from file paths with status colors and change counts.
// Returns structured nodes that can be rendered by DirectoryTreeView component.

/**
 * File status based on git diff
 */
export type FileStatus = "added" | "modified" | "deleted" | "renamed"

/**
 * Input file info for tree building
 */
export interface TreeFileInfo {
  path: string
  status: FileStatus
  additions: number
  deletions: number
  /** Optional index for scroll-to functionality */
  fileIndex?: number
}

/**
 * A single node in the rendered tree output
 */
export interface TreeNode {
  /** Display path (may be collapsed, e.g., "src/components") */
  displayPath: string
  /** Whether this is a file (true) or directory (false) */
  isFile: boolean
  /** File index for scroll-to (only for files) */
  fileIndex?: number
  /** File status (only for files) */
  status?: FileStatus
  /** Number of added lines (only for files) */
  additions?: number
  /** Number of deleted lines (only for files) */
  deletions?: number
  /** Tree connector character: "├── " or "└── " */
  connector: string
  /** Prefix string for tree lines, e.g., "│   " */
  prefix: string
}

interface InternalTreeNode {
  path: string
  title?: string
  fileIndex?: number
  status?: FileStatus
  additions?: number
  deletions?: number
  children: InternalTreeNode[]
}

/**
 * Build a directory tree from file paths
 * @param files Array of file info objects
 * @returns Array of TreeNode objects ready for rendering
 */
export function buildDirectoryTree(files: TreeFileInfo[]): TreeNode[] {
  if (files.length === 0) {
    return []
  }

  const tree = buildInternalTree(files)
  return flattenTree(tree)
}

/**
 * Build internal tree structure from file paths
 */
function buildInternalTree(files: TreeFileInfo[]): InternalTreeNode[] {
  const root: InternalTreeNode[] = []
  const nodeMap = new Map<string, InternalTreeNode>()

  for (const file of files) {
    const parts = file.path.split("/").filter((part) => part !== "")
    let currentPath = ""
    let currentLevel = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!
      currentPath = currentPath ? `${currentPath}/${part}` : part

      let node = nodeMap.get(currentPath)
      if (!node) {
        node = {
          path: currentPath,
          children: [],
        }
        nodeMap.set(currentPath, node)
        currentLevel.push(node)
      }

      // On the final part, assign file info
      if (i === parts.length - 1) {
        node.title = part
        node.fileIndex = file.fileIndex
        node.status = file.status
        node.additions = file.additions
        node.deletions = file.deletions
      }

      currentLevel = node.children
    }
  }

  return root
}

/**
 * Get the base name from a path
 */
function getName(node: InternalTreeNode): string {
  const parts = node.path.split("/")
  return parts[parts.length - 1] || node.path
}

/**
 * Collapse directories that only contain a single subdirectory (no files)
 */
function collapseNode(node: InternalTreeNode): {
  path: string
  collapsed: boolean
  children: InternalTreeNode[]
  originalNode: InternalTreeNode
} {
  let currentNode = node
  let collapsedPath = getName(currentNode)

  // Keep collapsing while:
  // - Current node has exactly one child
  // - Current node is not a file (no status/title means it's a directory)
  // - The single child is also a directory (no status)
  while (
    currentNode.children.length === 1 &&
    currentNode.status === undefined &&
    currentNode.children[0]!.status === undefined &&
    currentNode.children[0]!.children.length > 0
  ) {
    currentNode = currentNode.children[0]!
    collapsedPath = collapsedPath + "/" + getName(currentNode)
  }

  return {
    path: collapsedPath,
    collapsed: collapsedPath !== getName(node),
    children: currentNode.children,
    originalNode: currentNode,
  }
}

/**
 * Flatten the tree into a linear array of TreeNode objects
 */
function flattenTree(tree: InternalTreeNode[]): TreeNode[] {
  const result: TreeNode[] = []

  function processNode(
    node: InternalTreeNode,
    prefix: string,
    isLast: boolean,
    isRoot: boolean,
  ): void {
    const collapsed = collapseNode(node)
    const displayPath = collapsed.path
    const connector = isLast ? "\u2514\u2500\u2500 " : "\u251c\u2500\u2500 "

    // Determine if this is a file (has status) or directory
    const isFile = collapsed.originalNode.status !== undefined

    result.push({
      displayPath,
      isFile,
      fileIndex: collapsed.originalNode.fileIndex,
      status: collapsed.originalNode.status,
      additions: collapsed.originalNode.additions,
      deletions: collapsed.originalNode.deletions,
      connector,
      prefix,
    })

    // Process children
    if (collapsed.children.length > 0) {
      const childPrefix = prefix + (isLast ? "    " : "\u2502   ")

      collapsed.children.forEach((child, idx) => {
        const childIsLast = idx === collapsed.children.length - 1
        processNode(child, childPrefix, childIsLast, false)
      })
    }
  }

  // Process root level nodes
  tree.forEach((node, idx) => {
    const isLast = idx === tree.length - 1
    processNode(node, "", isLast, true)
  })

  return result
}
