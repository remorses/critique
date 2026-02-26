// Shared utilities for git diff processing across CLI commands.
// Builds git commands, parses diff files, detects filetypes for syntax highlighting,
// and provides helpers for unified/split view mode selection.

import { execSync } from "child_process"

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

/**
 * Metadata extracted from git diff rename/copy headers.
 * git diff -M adds these headers which the `diff` npm package silently skips.
 */
export interface RenameInfo {
  type: "rename" | "copy"
  from: string
  to: string
  similarity: number
}

/**
 * Preprocess raw git diff output to handle rename/copy detection.
 *
 * The `diff` npm package's parsePatch does not understand git's rename/copy
 * headers (similarity index, rename from/to, copy from/to). For pure renames
 * (100% similarity, no content changes), it produces broken entries because
 * there are no ---/+++ or @@ lines for it to parse.
 *
 * This function:
 * 1. Injects synthetic --- and +++ headers for pure renames/copies so parsePatch
 *    creates proper entries with correct filenames
 * 2. Extracts rename/copy metadata (type, from, to, similarity) for each file section
 *
 * @returns processedDiff: diff string safe for parsePatch, renameInfo: metadata per file index
 */
export function preprocessDiff(rawDiff: string): {
  processedDiff: string
  renameInfo: Map<number, RenameInfo>
} {
  const renameInfo = new Map<number, RenameInfo>()

  // Split into per-file sections at "diff --git" boundaries
  const lines = rawDiff.split("\n")
  const sections: { startIdx: number; lines: string[] }[] = []
  let currentSection: string[] | null = null

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (currentSection) {
        sections.push({ startIdx: sections.length, lines: currentSection })
      }
      currentSection = [line]
    } else if (currentSection) {
      currentSection.push(line)
    }
    // Lines before the first "diff --git" (e.g. commit metadata from git show) are ignored
  }
  if (currentSection) {
    sections.push({ startIdx: sections.length, lines: currentSection })
  }

  // Some callers may pass patch text produced by `diff`'s formatPatch(), which
  // uses "Index:" headers instead of "diff --git". In that case, do not
  // drop the whole payload: return it as-is so parsePatch can still parse hunks.
  if (sections.length === 0) {
    return {
      processedDiff: rawDiff,
      renameInfo,
    }
  }

  const outputSections: string[] = []

  for (let sectionIdx = 0; sectionIdx < sections.length; sectionIdx++) {
    const section = sections[sectionIdx]!
    const sectionLines = section.lines

    // Extract rename/copy metadata from this section
    let renameFrom: string | undefined
    let renameTo: string | undefined
    let copyFrom: string | undefined
    let copyTo: string | undefined
    let similarity: number | undefined
    let hasFileHeaders = false

    for (const line of sectionLines) {
      if (line.startsWith("--- ")) hasFileHeaders = true
      const renameFromMatch = line.match(/^rename from (.+)$/)
      if (renameFromMatch) renameFrom = renameFromMatch[1]
      const renameToMatch = line.match(/^rename to (.+)$/)
      if (renameToMatch) renameTo = renameToMatch[1]
      const copyFromMatch = line.match(/^copy from (.+)$/)
      if (copyFromMatch) copyFrom = copyFromMatch[1]
      const copyToMatch = line.match(/^copy to (.+)$/)
      if (copyToMatch) copyTo = copyToMatch[1]
      const similarityMatch = line.match(/^similarity index (\d+)%$/)
      if (similarityMatch) similarity = parseInt(similarityMatch[1]!, 10)
    }

    // Store rename/copy metadata
    if (renameFrom && renameTo) {
      renameInfo.set(sectionIdx, {
        type: "rename",
        from: renameFrom,
        to: renameTo,
        similarity: similarity ?? 100,
      })
    } else if (copyFrom && copyTo) {
      renameInfo.set(sectionIdx, {
        type: "copy",
        from: copyFrom,
        to: copyTo,
        similarity: similarity ?? 100,
      })
    }

    // For pure renames/copies (no --- +++ headers), inject synthetic headers
    // so parsePatch creates a proper entry with filenames
    if (!hasFileHeaders && (renameFrom && renameTo)) {
      outputSections.push([...sectionLines, `--- ${renameFrom}`, `+++ ${renameTo}`].join("\n"))
    } else if (!hasFileHeaders && (copyFrom && copyTo)) {
      outputSections.push([...sectionLines, `--- ${copyFrom}`, `+++ ${copyTo}`].join("\n"))
    } else {
      outputSections.push(sectionLines.join("\n"))
    }
  }

  return {
    processedDiff: outputSections.join("\n"),
    renameInfo,
  }
}

/**
 * Parse git diff output with rename/copy detection support.
 * Preprocesses the diff for pure renames, delegates to parsePatch from the `diff` package,
 * and enriches results with rename metadata.
 *
 * Use this instead of calling parsePatch directly when processing git diff -M output.
 *
 * Generic to preserve the concrete type returned by parsePatch (e.g. StructuredPatch).
 */
export function parseGitDiffFiles<T>(
  rawDiff: string,
  parsePatch: (diff: string) => T[],
): (T & { renameFrom?: string; renameTo?: string; similarity?: number })[] {
  const { processedDiff, renameInfo } = preprocessDiff(rawDiff)
  const files = parsePatch(processedDiff)

  type Enriched = T & { renameFrom?: string; renameTo?: string; similarity?: number }

  // Enrich files with rename metadata
  return files.map((file, index): Enriched => {
    const info = renameInfo.get(index)
    if (!info) return file as Enriched
    return {
      ...file,
      renameFrom: info.from,
      renameTo: info.to,
      similarity: info.similarity,
    } as Enriched
  })
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
  /** Set when this file was renamed (git diff -M) */
  renameFrom?: string;
  renameTo?: string;
  /** Similarity percentage for renames/copies (0-100) */
  similarity?: number;
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
 * Normalize file filter patterns from both --filter and positional args after --.
 */
export function getFilterPatterns(
  options: Pick<GitCommandOptions, "filter" | "positionalFilters">,
): string[] {
  const filterOptions = options.filter
    ? Array.isArray(options.filter)
      ? options.filter
      : [options.filter]
    : [];
  const positionalFilters = options.positionalFilters || [];
  return [...new Set([...filterOptions, ...positionalFilters].filter((pattern) => pattern.length > 0))];
}

/**
 * Check whether a filepath matches any user-provided file filter glob.
 * No patterns means "match everything".
 */
export function matchesFileFilters(filePath: string, patterns: string[]): boolean {
  if (patterns.length === 0) return true;

  return patterns.some((rawPattern) => {
    const pattern = rawPattern.startsWith("./") ? rawPattern.slice(2) : rawPattern;
    if (pattern === "." || pattern === "") return true;

    // Keep compatibility with existing git pathspec behavior for plain paths:
    // - "src" should match "src/**"
    // - "src/" should match descendants under src/
    // - "src/file.ts" should match that exact file
    const hasGlobMagic = /[*?[\]{}!]/.test(pattern);
    if (!hasGlobMagic) {
      if (pattern.endsWith("/")) {
        return filePath.startsWith(pattern);
      }
      return filePath === pattern || filePath.startsWith(pattern + "/");
    }

    const glob = new Bun.Glob(pattern);
    return glob.match(filePath);
  });
}

/**
 * Apply critique --filter globs to already-parsed diff files.
 * This is used after appending submodule diffs, where git pathspec filters are
 * no longer sufficient.
 */
export function filterParsedFilesByPatterns<T extends ParsedFile>(
  files: T[],
  options: Pick<GitCommandOptions, "filter" | "positionalFilters">,
): T[] {
  const patterns = getFilterPatterns(options);
  if (patterns.length === 0) return files;

  return files.filter((file) => matchesFileFilters(getFileName(file), patterns));
}

/**
 * Build git command string based on options
 */
export function buildGitCommand(options: GitCommandOptions): string {
  const contextArg = options.context ? `-U${options.context}` : "";
  // Show full submodule diffs instead of just commit hashes
  const submoduleArg = "--submodule=diff";
  // Detect renames instead of showing full delete+add
  const renameArg = "-M";

  // Combine --filter options with positional args after --
  const filters = getFilterPatterns(options);
  // Use single quotes to prevent shell expansion of $ in paths like d.$owner.$repo.$.tsx
  const filterArg =
    filters.length > 0
      ? `-- ${filters.map((f: string) => `'${f}'`).join(" ")}`
      : "";

  if (options.staged) {
    return `git diff --cached --no-prefix ${renameArg} ${submoduleArg} ${contextArg} ${filterArg}`.trim();
  }
  if (options.commit) {
    return `git show ${options.commit} --no-prefix ${renameArg} ${submoduleArg} ${contextArg} ${filterArg}`.trim();
  }
  // Two refs: compare base...head (three-dot, shows changes since branches diverged, like GitHub PRs)
  if (options.base && options.head) {
    return `git diff ${options.base}...${options.head} --no-prefix ${renameArg} ${submoduleArg} ${contextArg} ${filterArg}`.trim();
  }
  // Detect range syntax in single base argument (e.g., "origin/main...HEAD" or "main..feature")
  if (options.base && !options.head) {
    // Three-dot syntax: A...B (merge-base to B, like GitHub PRs)
    const threeDotsMatch = options.base.match(/^(.+)\.\.\.(.+)$/);
    if (threeDotsMatch) {
      const [, rangeBase, rangeHead] = threeDotsMatch;
      return `git diff ${rangeBase}...${rangeHead} --no-prefix ${renameArg} ${submoduleArg} ${contextArg} ${filterArg}`.trim();
    }

    // Two-dot syntax: A..B (commits in B not in A)
    const twoDotsMatch = options.base.match(/^(.+)\.\.(.+)$/);
    if (twoDotsMatch) {
      const [, rangeBase, rangeHead] = twoDotsMatch;
      return `git diff ${rangeBase}..${rangeHead} --no-prefix ${renameArg} ${submoduleArg} ${contextArg} ${filterArg}`.trim();
    }
  }
  // Single ref: compare ref to working tree (like git diff)
  if (options.base) {
    return `git diff ${options.base} --no-prefix ${renameArg} ${submoduleArg} ${contextArg} ${filterArg}`.trim();
  }
  // Default (no args): ignore submodules here — dirty submodule diffs are fetched
  // separately via buildSubmoduleDiffCommand() to avoid showing committed submodule
  // ref changes that have no actual uncommitted content.
  return `git add -N . && git diff --no-prefix ${renameArg} --ignore-submodules=all ${contextArg} ${filterArg}`.trim();
}

/**
 * Get submodule paths that have dirty working trees (uncommitted changes).
 * Returns only submodules with actual uncommitted modifications, not those
 * that merely point to a different commit than what the parent repo recorded.
 *
 * Uses `git submodule status` which prefixes each line with:
 * - ' ' (space): submodule matches recorded commit and is clean
 * - '+': submodule is at a different commit than recorded
 * - '-': submodule is not initialized
 * - 'U': submodule has merge conflicts
 *
 * A submodule with '+' prefix AND a trailing dirty marker (e.g. " (modified content)")
 * or one where `git status --porcelain` inside it is non-empty has dirty changes.
 */
export function getDirtySubmodulePaths(): string[] {
  try {
    // git submodule foreach runs a command in each initialized submodule.
    // We check if the submodule has any uncommitted changes (modified, staged, or untracked).
    // $displaypath gives us the relative path from the parent repo root.
    const output = execSync(
      `git submodule foreach --quiet 'if [ -n "$(git status --porcelain)" ]; then echo "$displaypath"; fi'`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    )
    return output
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
  } catch {
    // No submodules, or git command failed — return empty
    return []
  }
}

/**
 * Build a git diff command that only shows diffs for specific submodule paths.
 * Used to get the actual file-level diffs inside dirty submodules.
 */
export function buildSubmoduleDiffCommand(
  submodulePaths: string[],
  options: Pick<GitCommandOptions, "context">,
): string {
  const contextArg = options.context ? `-U${options.context}` : ""
  const renameArg = "-M"
  const submoduleArg = "--submodule=diff"
  const pathArgs = submodulePaths.map((p) => `'${p}'`).join(" ")
  return `git diff --no-prefix ${renameArg} ${submoduleArg} ${contextArg} -- ${pathArgs}`.trim()
}

/**
 * Get file status from parsed diff file
 * - added: oldFileName is /dev/null (new file)
 * - deleted: newFileName is /dev/null (removed file)
 * - renamed: file has renameFrom/renameTo metadata, or oldFileName !== newFileName
 *   (with --no-prefix, different filenames means rename since there's no a/ b/ prefix)
 * - modified: both files exist with same name (changed file)
 */
export function getFileStatus(file: {
  oldFileName?: string;
  newFileName?: string;
  renameFrom?: string;
  renameTo?: string;
}): "added" | "modified" | "deleted" | "renamed" {
  const oldName = file.oldFileName;
  const newName = file.newFileName;

  if (!oldName || oldName === "/dev/null") return "added";
  if (!newName || newName === "/dev/null") return "deleted";
  // Explicit rename metadata from preprocessDiff
  if (file.renameFrom && file.renameTo) return "renamed";
  // With --no-prefix, different filenames means rename
  if (oldName !== newName) return "renamed";
  return "modified";
}

/**
 * Get filename from parsed diff file, handling /dev/null for new/deleted files.
 * For renames, returns the new name (destination).
 */
export function getFileName(file: {
  oldFileName?: string;
  newFileName?: string;
  renameTo?: string;
}): string {
  // For renames, prefer the renameTo metadata (always clean, no prefix)
  if (file.renameTo) return file.renameTo;

  const newName = file.newFileName;
  const oldName = file.oldFileName;

  // Filter out /dev/null which appears for new/deleted files
  if (newName && newName !== "/dev/null") return newName;
  if (oldName && oldName !== "/dev/null") return oldName;

  return "unknown";
}

/**
 * Get the old filename for display purposes (e.g., "old-name.ts -> new-name.ts").
 * Returns undefined if the file was not renamed.
 */
export function getOldFileName(file: {
  oldFileName?: string;
  newFileName?: string;
  renameFrom?: string;
  renameTo?: string;
}): string | undefined {
  if (file.renameFrom && file.renameTo) return file.renameFrom;
  const oldName = file.oldFileName;
  const newName = file.newFileName;
  if (oldName && newName && oldName !== newName && oldName !== "/dev/null" && newName !== "/dev/null") {
    return oldName;
  }
  return undefined;
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
 * Maps to tree-sitter parsers available in @opentuah/core and parsers-config.ts
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
    case "json":
      return "json";
    case "md":
    case "mdx":
      return "markdown";
    case "zig":
      return "zig";
    // Languages from parsers-config.ts
    case "py":
    case "pyw":
    case "pyi":
      return "python";
    case "rs":
      return "rust";
    case "go":
      return "go";
    case "cpp":
    case "cc":
    case "cxx":
    case "hpp":
    case "hxx":
    case "h":
      return "cpp";
    case "cs":
      return "csharp";
    case "sh":
    case "bash":
    case "zsh":
      return "bash";
    case "c":
      return "c";
    case "java":
      return "java";
    case "rb":
    case "rake":
    case "gemspec":
      return "ruby";
    case "php":
      return "php";
    case "scala":
    case "sc":
      return "scala";
    case "html":
    case "htm":
      return "html";
    case "yaml":
    case "yml":
      return "yaml";
    case "hs":
    case "lhs":
      return "haskell";
    case "css":
      return "css";
    case "jl":
      return "julia";
    case "ml":
    case "mli":
      return "ocaml";
    case "clj":
    case "cljs":
    case "cljc":
    case "edn":
      return "clojure";
    case "swift":
      return "swift";
    case "nix":
      return "nix";
    case "prisma":
      return "prisma";
    default:
      return undefined;
  }
}
