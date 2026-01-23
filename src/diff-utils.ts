// Shared utilities for git diff processing across CLI commands.
// Builds git commands, parses diff files, detects filetypes for syntax highlighting,
// and provides helpers for unified/split view mode selection.

/**
 * Strip submodule status lines from git diff output.
 * git diff --submodule=diff adds various status lines that the diff parser doesn't understand:
 * - "Submodule name hash1..hash2:" (header before submodule diff)
 * - "Submodule name contains modified content"
 * - "Submodule name contains untracked content"
 * - "Submodule name (new commits)"
 * - "Submodule name (commits not present)"
 */
export function stripSubmoduleHeaders(diffOutput: string): string {
  return diffOutput
    .split("\n")
    .filter((line) => {
      // Match lines like "Submodule errore 1bf6fc8..d746b25:"
      if (line.match(/^Submodule \S+ [a-f0-9]+\.\.[a-f0-9]+:?$/)) return false;
      // Match lines like "Submodule unframer contains modified content"
      if (line.match(/^Submodule \S+ contains (modified|untracked) content$/))
        return false;
      // Match lines like "Submodule name (new commits)" or "(commits not present)"
      if (line.match(/^Submodule \S+ \(.*\)$/)) return false;
      return true;
    })
    .join("\n");
}

export const IGNORED_FILES = [
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
  "Cargo.lock",
  "poetry.lock",
  "Gemfile.lock",
  "composer.lock",
];

export interface ParsedFile {
  oldFileName?: string;
  newFileName?: string;
  oldHeader?: string;
  newHeader?: string;
  hunks: Array<{ lines: string[] }>;
  rawDiff?: string;
}

export interface GitCommandOptions {
  staged?: boolean;
  commit?: string;
  base?: string;
  head?: string;
  context?: string | number;
  filter?: string | string[];
  positionalFilters?: string[];
}

/**
 * Build git command string based on options
 */
export function buildGitCommand(options: GitCommandOptions): string {
  const contextArg = options.context ? `-U${options.context}` : "";
  // Show full submodule diffs instead of just commit hashes
  const submoduleArg = "--submodule=diff";

  // Combine --filter options with positional args after --
  const filterOptions = options.filter
    ? Array.isArray(options.filter)
      ? options.filter
      : [options.filter]
    : [];
  const positionalFilters = options.positionalFilters || [];
  const filters = [...filterOptions, ...positionalFilters];
  const filterArg =
    filters.length > 0
      ? `-- ${filters.map((f: string) => `"${f}"`).join(" ")}`
      : "";

  if (options.staged) {
    return `git diff --cached --no-prefix ${submoduleArg} ${contextArg} ${filterArg}`.trim();
  }
  if (options.commit) {
    return `git show ${options.commit} --no-prefix ${submoduleArg} ${contextArg} ${filterArg}`.trim();
  }
  // Two refs: compare base...head (three-dot, shows changes since branches diverged, like GitHub PRs)
  if (options.base && options.head) {
    return `git diff ${options.base}...${options.head} --no-prefix ${submoduleArg} ${contextArg} ${filterArg}`.trim();
  }
  // Detect range syntax in single base argument (e.g., "origin/main...HEAD" or "main..feature")
  if (options.base && !options.head) {
    // Three-dot syntax: A...B (merge-base to B, like GitHub PRs)
    const threeDotsMatch = options.base.match(/^(.+)\.\.\.(.+)$/);
    if (threeDotsMatch) {
      const [, rangeBase, rangeHead] = threeDotsMatch;
      return `git diff ${rangeBase}...${rangeHead} --no-prefix ${submoduleArg} ${contextArg} ${filterArg}`.trim();
    }

    // Two-dot syntax: A..B (commits in B not in A)
    const twoDotsMatch = options.base.match(/^(.+)\.\.(.+)$/);
    if (twoDotsMatch) {
      const [, rangeBase, rangeHead] = twoDotsMatch;
      return `git diff ${rangeBase}..${rangeHead} --no-prefix ${submoduleArg} ${contextArg} ${filterArg}`.trim();
    }
  }
  // Single ref: show that commit's changes
  if (options.base) {
    return `git show ${options.base} --no-prefix ${submoduleArg} ${contextArg} ${filterArg}`.trim();
  }
  return `git add -N . && git diff --no-prefix ${submoduleArg} ${contextArg} ${filterArg}`.trim();
}

/**
 * Get file status from parsed diff file based on /dev/null presence
 * - added: oldFileName is /dev/null (new file)
 * - deleted: newFileName is /dev/null (removed file)
 * - modified: both files exist (changed file)
 */
export function getFileStatus(file: {
  oldFileName?: string;
  newFileName?: string;
}): "added" | "modified" | "deleted" {
  const oldName = file.oldFileName;
  const newName = file.newFileName;

  if (!oldName || oldName === "/dev/null") return "added";
  if (!newName || newName === "/dev/null") return "deleted";
  return "modified";
}

/**
 * Get filename from parsed diff file, handling /dev/null for new/deleted files
 */
export function getFileName(file: {
  oldFileName?: string;
  newFileName?: string;
}): string {
  const newName = file.newFileName;
  const oldName = file.oldFileName;

  // Filter out /dev/null which appears for new/deleted files
  if (newName && newName !== "/dev/null") return newName;
  if (oldName && oldName !== "/dev/null") return oldName;

  return "unknown";
}

/**
 * Count additions and deletions from hunks
 */
export function countChanges(hunks: Array<{ lines: string[] }>): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;

  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) additions++;
      if (line.startsWith("-")) deletions++;
    }
  }

  return { additions, deletions };
}

/**
 * Determine view mode based on changes and terminal width
 * @param splitThreshold - minimum cols for split view (default 100 for TUI, 150 for web)
 */
export function getViewMode(
  additions: number,
  deletions: number,
  cols: number,
  splitThreshold: number = 100,
): "split" | "unified" {
  // Use unified view for fully added or fully deleted files (one side would be empty in split view)
  const isFullyAdded = additions > 0 && deletions === 0;
  const isFullyDeleted = deletions > 0 && additions === 0;
  const useUnifiedForFile = isFullyAdded || isFullyDeleted;

  if (useUnifiedForFile) return "unified";
  return cols >= splitThreshold ? "split" : "unified";
}

/**
 * Filter and sort parsed diff files, add rawDiff
 */
export function processFiles<T extends ParsedFile>(
  files: T[],
  formatPatch: (file: T) => string,
): (T & { rawDiff: string })[] {
  const filteredFiles = files.filter((file) => {
    const fileName = getFileName(file);
    const baseName = fileName.split("/").pop() || "";

    if (IGNORED_FILES.includes(baseName) || baseName.endsWith(".lock")) {
      return false;
    }

    const totalLines = file.hunks.reduce(
      (sum, hunk) => sum + hunk.lines.length,
      0,
    );
    return totalLines <= 6000;
  });

  const sortedFiles = filteredFiles.sort((a, b) => {
    const aSize = a.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
    const bSize = b.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
    return aSize - bSize;
  });

  // Add rawDiff for each file
  return sortedFiles.map((file) => ({
    ...file,
    rawDiff: formatPatch(file),
  }));
}

/**
 * Detect filetype from filename for syntax highlighting
 * Maps to tree-sitter parsers available in @opentui/core: typescript, javascript, markdown, zig
 */
export function detectFiletype(filePath: string): string | undefined {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    // TypeScript parser handles TS, TSX, JS, JSX (it's a superset)
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
    case "mts":
    case "cts":
      return "typescript";
    // JSON uses JavaScript parser (JSON is valid JS)
    case "json":
      return "javascript";
    case "md":
    case "mdx":
      return "markdown";
    case "zig":
      return "zig";
    default:
      return undefined;
  }
}
