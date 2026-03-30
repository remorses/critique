// Delimiter balancing for syntax highlighting in diff hunks.
//
// When a diff hunk starts or ends inside a paired delimiter (template
// literal, triple-quoted string, fenced code block, etc.), tree-sitter can
// misparse everything after the unmatched token.
//
// Boundary repair strategy:
//   1. Tokenizer: count delimiter occurrences in each hunk's content,
//      skipping escaped characters.
//   2. Repair symmetric delimiters by escaping the unmatched boundary token.
//   3. Repair asymmetric delimiters by appending the closing token to the
//      last content line in the hunk so later hunks do not inherit state.
//
// For strings/docstrings, repairing the actual unmatched token is safer than
// prepending a synthetic opener because it keeps the mutation local and avoids
// duplicating delimiters like ``` -> ``````. Markdown fences are the exception:
// their contextual open/close classification lets us safely add inline fence
// context without rewriting hunk headers.

type BoundaryKind = "open" | "close" | "unknown"

interface DelimiterRule {
  token: string
  closeToken?: string
  openTokens?: string[]
  /**
   * Optional function to classify a token occurrence as an opener, closer,
   * or not-a-fence (null). Used for context-dependent delimiters like markdown
   * code fences where the open/close distinction depends on the info string.
   * Receives the content line (diff prefix stripped) and the column of the token.
   */
  classifyFence?: (content: string, column: number) => "open" | "close" | null
}

const cStyleBlockCommentRule: DelimiterRule = {
  token: "/*",
  closeToken: "*/",
}

const htmlCommentRule: DelimiterRule = {
  token: "<!--",
  closeToken: "-->",
}

/**
 * Delimiters to balance per language filetype.
 *
 * Each entry maps a filetype (from detectFiletype) to the list of delimiters
 * that come in open/close pairs and can span lines.
 */
const LANGUAGE_DELIMITERS: Record<string, DelimiterRule[]> = {
  typescript: [{ token: "`" }, cStyleBlockCommentRule],
  python: [{ token: '"""' }, { token: "'''" }],
  markdown: [{ token: "```", classifyFence: classifyMarkdownFence }],
  go: [{ token: "`" }, cStyleBlockCommentRule],
  rust: [cStyleBlockCommentRule],
  cpp: [cStyleBlockCommentRule],
  csharp: [cStyleBlockCommentRule],
  c: [cStyleBlockCommentRule],
  java: [cStyleBlockCommentRule],
  php: [cStyleBlockCommentRule],
  scala: [{ token: '"""' }, cStyleBlockCommentRule],
  html: [htmlCommentRule],
  css: [cStyleBlockCommentRule],
  swift: [{ token: '"""' }, cStyleBlockCommentRule],
  julia: [{ token: '"""' }],
}

/**
 * Count unescaped occurrences of a delimiter in a code string.
 *
 * Walks character by character. Backslash skips the next character,
 * otherwise checks for the delimiter at the current position.
 * Handles both single-char (`) and multi-char (""") delimiters.
 */
export function countDelimiter(code: string, delimiter: string): number {
  let count = 0
  const len = delimiter.length

  for (let i = 0; i < code.length; i++) {
    if (code[i] === "\\") {
      i++
    } else if (code.startsWith(delimiter, i)) {
      count++
      i += len - 1
    }
  }

  return count
}

interface DiffHunk {
  header: string
  lines: string[]
}

interface ContentLine {
  hunkLineIndex: number
  content: string
}

interface DelimiterOccurrence {
  contentLineIndex: number
  hunkLineIndex: number
  column: number
}

function isDiffContentLine(line: string): boolean {
  return line[0] === " " || line[0] === "+" || line[0] === "-"
}

function getContentLines(lines: readonly string[]): ContentLine[] {
  return lines.flatMap((line, hunkLineIndex) =>
    isDiffContentLine(line)
      ? [{ hunkLineIndex, content: line.slice(1) }]
      : [],
  )
}

function findDelimiterOccurrences(
  contentLines: readonly ContentLine[],
  delimiter: string,
): DelimiterOccurrence[] {
  const occurrences: DelimiterOccurrence[] = []

  for (const [contentLineIndex, line] of contentLines.entries()) {
    const content = line.content
    const len = delimiter.length

    for (let column = 0; column < content.length; column++) {
      if (content[column] === "\\") {
        column++
        continue
      }

      if (!content.startsWith(delimiter, column)) {
        continue
      }

      occurrences.push({
        contentLineIndex,
        hunkLineIndex: line.hunkLineIndex,
        column,
      })
      column += len - 1
    }
  }

  return occurrences
}

function findAnyDelimiterOccurrences(
  contentLines: readonly ContentLine[],
  delimiters: readonly string[],
): DelimiterOccurrence[] {
  const ordered = [...delimiters].sort((a, b) => b.length - a.length)
  const occurrences: DelimiterOccurrence[] = []

  for (const [contentLineIndex, line] of contentLines.entries()) {
    const content = line.content

    for (let column = 0; column < content.length; column++) {
      if (content[column] === "\\") {
        column++
        continue
      }

      const matched = ordered.find((delimiter) => content.startsWith(delimiter, column))
      if (!matched) {
        continue
      }

      occurrences.push({
        contentLineIndex,
        hunkLineIndex: line.hunkLineIndex,
        column,
      })
      column += matched.length - 1
    }
  }

  return occurrences
}

function getPreviousNonWhitespaceChar(content: string, column: number): string | undefined {
  for (let i = column - 1; i >= 0; i--) {
    const char = content[i]
    if (char && !/\s/.test(char)) {
      return char
    }
  }
  return undefined
}

function getNextNonWhitespaceChar(content: string, column: number): string | undefined {
  for (let i = column; i < content.length; i++) {
    const char = content[i]
    if (char && !/\s/.test(char)) {
      return char
    }
  }
  return undefined
}

function hasNonEmptyContentBefore(contentLines: readonly ContentLine[], contentLineIndex: number): boolean {
  return contentLines.slice(0, contentLineIndex).some((line) => line.content.trim() !== "")
}

function hasNonEmptyContentAfter(contentLines: readonly ContentLine[], contentLineIndex: number): boolean {
  return contentLines.slice(contentLineIndex + 1).some((line) => line.content.trim() !== "")
}

function classifyOccurrence(
  contentLines: readonly ContentLine[],
  occurrence: DelimiterOccurrence,
  token: string,
): BoundaryKind {
  const content = contentLines[occurrence.contentLineIndex]?.content
  if (content === undefined) {
    return "unknown"
  }

  const before = getPreviousNonWhitespaceChar(content, occurrence.column)
  const after = getNextNonWhitespaceChar(content, occurrence.column + token.length)
  const trimmed = content.trim()
  const hasBeforeLines = hasNonEmptyContentBefore(contentLines, occurrence.contentLineIndex)
  const hasAfterLines = hasNonEmptyContentAfter(contentLines, occurrence.contentLineIndex)

  if (token.length > 1) {
    if (trimmed === token) {
      if (hasBeforeLines) return "close"
      if (hasAfterLines) return "open"
      return "unknown"
    }

    if (trimmed.startsWith(token)) {
      if (hasBeforeLines && (!after || /[.\])};:,]/.test(after))) {
        return "close"
      }

      if (after) {
        return "open"
      }
    }

    if (trimmed.endsWith(token)) {
      return "close"
    }

    return "unknown"
  }

  if (!before && after) {
    return "open"
  }

  if (before && !after) {
    return "close"
  }

  if (after && /[$A-Za-z0-9_{[(]/.test(after)) {
    return "open"
  }

  if (before && after && /[)\]};:.,]/.test(after)) {
    return "close"
  }

  return "unknown"
}

function escapeDelimiterAt(lines: readonly string[], hunkLineIndex: number, column: number): string[] {
  return lines.map((line, index) => {
    if (index !== hunkLineIndex || !isDiffContentLine(line)) {
      return line
    }

    const prefix = line[0] ?? ""
    const content = line.slice(1)
    return prefix + content.slice(0, column) + "\\" + content.slice(column)
  })
}

// ---------------------------------------------------------------------------
// Contextual fence classification and repair (markdown code fences)
// ---------------------------------------------------------------------------

/**
 * Classify a ``` occurrence as a markdown fence opener, closer, or not a fence.
 *
 * Returns null if the occurrence is not a valid block-level fence (e.g. inline
 * triple-backtick in prose, or indented more than 3 spaces).
 * Returns "open" if followed by an info string (language tag).
 * Returns "close" if nothing follows the backtick run (only whitespace).
 */
function classifyMarkdownFence(content: string, column: number): "open" | "close" | null {
  // Must be at start of line with at most 3 spaces of indentation
  const beforeFence = content.slice(0, column)
  if (beforeFence.length > 3 || /\S/.test(beforeFence)) return null

  // Count consecutive backticks (support 4+ backtick fences per CommonMark)
  let fenceLen = 0
  for (let i = column; i < content.length && content[i] === "`"; i++) fenceLen++
  if (fenceLen < 3) return null

  // What comes after the backtick run?
  const afterFence = content.slice(column + fenceLen).trim()

  // Closing fence: nothing after backticks (only whitespace)
  if (!afterFence) return "close"

  // Opening fence: has info string (language tag)
  // Info string must not contain backticks (CommonMark spec)
  if (!afterFence.includes("`")) return "open"

  return null
}

interface ClassifiedFence {
  occurrence: DelimiterOccurrence
  kind: "open" | "close"
}

interface WalkResult {
  startDepth: number
  endDepth: number
  conflicts: number
}

interface ClassifiedAsymmetricOccurrence {
  kind: "open" | "close"
}

/**
 * Simulate a sequential walk through classified fences to detect boundary
 * artifacts. Markdown code fences don't nest, so depth toggles between 0
 * (outside) and 1 (inside).
 *
 * - "open" (has info string) always pushes depth to 1.
 * - "close" (bare fence) decrements if inside, or acts as a bare opener
 *   if already outside (a code block without a language tag).
 *
 * Conflicts are counted when a must-open fires while already inside (depth
 * was already 1) or when other impossible transitions occur.
 */
function walkFences(fences: readonly ClassifiedFence[], startDepth: number): WalkResult {
  let depth = startDepth
  let conflicts = 0

  for (const fence of fences) {
    if (fence.kind === "open") {
      if (depth > 0) conflicts++
      depth = 1
    } else {
      // "close" (bare fence): close if inside, otherwise bare opener
      if (depth > 0) {
        depth = 0
      } else {
        depth = 1
      }
    }
  }

  return { startDepth, endDepth: depth, conflicts }
}

function walkAsymmetricOccurrences(
  occurrences: readonly ClassifiedAsymmetricOccurrence[],
  startDepth: number,
): WalkResult {
  let depth = startDepth
  let conflicts = 0

  for (const occurrence of occurrences) {
    if (occurrence.kind === "open") {
      depth++
      continue
    }

    if (depth > 0) {
      depth--
      continue
    }

    conflicts++
  }

  return { startDepth, endDepth: depth, conflicts }
}

/**
 * Repair context-dependent fences (like markdown ```) using sequential
 * open/close pairing instead of simple odd/even counting.
 *
 * Tries two starting states (outside vs inside a code block), picks the
 * walk with fewer conflicts, and adds synthetic fence tokens inline:
 * - If the hunk starts inside a block: prepend ``` to the first content
 *   line so the boundary closer has something to close.
 * - If the hunk ends inside a block: append ``` to the last content
 *   line so the boundary opener is properly closed.
 * Tokens are added inline (no new lines) to preserve patch header counts.
 */
function repairContextualFences(
  contentLines: readonly ContentLine[],
  lines: readonly string[],
  rule: DelimiterRule,
): string[] {
  if (!rule.classifyFence) return [...lines]

  const occurrences = findDelimiterOccurrences(contentLines, rule.token)
  if (occurrences.length === 0) return [...lines]

  // Classify each occurrence as fence open, close, or not-a-fence
  const fences: ClassifiedFence[] = []
  for (const occ of occurrences) {
    const content = contentLines[occ.contentLineIndex]?.content
    if (!content) continue
    const kind = rule.classifyFence(content, occ.column)
    if (kind) {
      fences.push({ occurrence: occ, kind })
    }
  }

  if (fences.length === 0) return [...lines]

  // Try both starting states
  const walk0 = walkFences(fences, 0)
  const walk1 = walkFences(fences, 1)

  // Pick better walk: fewer conflicts → fewer repairs → content heuristic
  let chosen: WalkResult
  if (walk0.conflicts < walk1.conflicts) {
    chosen = walk0
  } else if (walk1.conflicts < walk0.conflicts) {
    chosen = walk1
  } else {
    const repairs0 = (walk0.startDepth > 0 ? 1 : 0) + (walk0.endDepth > 0 ? 1 : 0)
    const repairs1 = (walk1.startDepth > 0 ? 1 : 0) + (walk1.endDepth > 0 ? 1 : 0)
    if (repairs0 < repairs1) {
      chosen = walk0
    } else if (repairs1 < repairs0) {
      chosen = walk1
    } else {
      // Still tied: disambiguate by content position relative to the first fence.
      // If there's non-empty content before the first fence in the hunk, the fence
      // is likely closing a block from before the hunk → prefer depth=1 (starts inside).
      // This produces better tree-sitter pairing: the prepended ``` + original ```
      // form a matched pair, while appended inline ``` doesn't close a fence.
      const firstIdx = fences[0]?.occurrence.contentLineIndex ?? 0
      const hasContentBefore = contentLines.slice(0, firstIdx).some((line) => line.content.trim() !== "")
      chosen = hasContentBefore ? walk1 : walk0
    }
  }

  let result = [...lines]

  // Append synthetic closer to end of last content line (inline, no new lines)
  if (chosen.endDepth > 0) {
    result = appendClosingTokensToLastContentLine(result, rule.token, 1)
  }

  // Prepend synthetic opener to start of first content line (inline, no new lines).
  // Pass the first fence's hunk line index so the search only looks at lines
  // before the boundary closer — the opener must precede it to form a pair.
  if (chosen.startDepth > 0) {
    const firstFenceHunkLine = fences[0]?.occurrence.hunkLineIndex
    result = prependOpeningTokenToFirstContentLine(result, rule.token, firstFenceHunkLine)
  }

  return result
}

function getRuleOpenTokens(rule: DelimiterRule): string[] {
  return rule.openTokens ?? [rule.token]
}

function getRuleCloseToken(rule: DelimiterRule): string {
  return rule.closeToken ?? rule.token
}

function isSymmetricRule(rule: DelimiterRule): boolean {
  const openTokens = getRuleOpenTokens(rule)
  const closeToken = getRuleCloseToken(rule)
  return openTokens.length === 1 && openTokens[0] === closeToken
}

function getUnclosedTokenCount(lines: readonly string[], rule: DelimiterRule): number {
  const contentLines = getContentLines(lines)
  const openTokens = getRuleOpenTokens(rule)
  const closeToken = getRuleCloseToken(rule)

  if (isSymmetricRule(rule)) {
    return 0
  }

  const orderedTokens = [...openTokens, closeToken]
  const occurrences = findAnyDelimiterOccurrences(contentLines, orderedTokens)
  if (occurrences.length === 0) {
    return 0
  }

  const classified: ClassifiedAsymmetricOccurrence[] = []
  for (const occurrence of occurrences) {
    const content = contentLines[occurrence.contentLineIndex]?.content
    if (content === undefined) {
      continue
    }

    if (content.startsWith(closeToken, occurrence.column)) {
      classified.push({ kind: "close" })
      continue
    }

    const matchedOpen = openTokens.some((token) => content.startsWith(token, occurrence.column))
    if (matchedOpen) {
      classified.push({ kind: "open" })
    }
  }

  if (classified.length === 0) {
    return 0
  }

  const walk0 = walkAsymmetricOccurrences(classified, 0)
  const walk1 = walkAsymmetricOccurrences(classified, 1)

  if (walk0.conflicts < walk1.conflicts) {
    return walk0.endDepth
  }

  if (walk1.conflicts < walk0.conflicts) {
    return walk1.endDepth
  }

  return Math.min(walk0.endDepth, walk1.endDepth)
}

function appendClosingTokensToLastContentLine(lines: readonly string[], closeToken: string, count: number): string[] {
  if (count <= 0) {
    return [...lines]
  }

  const lastContentLineIndex = [...lines].findLastIndex(isDiffContentLine)
  if (lastContentLineIndex === -1) {
    return [...lines]
  }

  const closingSuffix = Array.from({ length: count }, () => closeToken).join(" ")

  return lines.map((line, index) => {
    if (index !== lastContentLineIndex || !isDiffContentLine(line)) {
      return line
    }

    return `${line} ${closingSuffix}`
  })
}

function prependOpeningTokenToFirstContentLine(
  lines: readonly string[],
  openToken: string,
  beforeHunkLineIndex?: number,
): string[] {
  // Prefer a blank/whitespace content line to avoid creating a fake info string
  // (e.g. "```   handler() {" makes tree-sitter think "handler()" is a language).
  // Only search among lines BEFORE the first fence so the synthetic opener
  // appears before the boundary closer (they need to pair).
  const firstContentLineIndex = lines.findIndex(isDiffContentLine)
  if (firstContentLineIndex === -1) {
    return [...lines]
  }

  const searchEnd = beforeHunkLineIndex ?? lines.length
  let targetIndex = firstContentLineIndex
  for (let i = firstContentLineIndex; i < searchEnd; i++) {
    const line = lines[i]!
    if (!isDiffContentLine(line)) continue
    if (line.slice(1).trim() === "") {
      targetIndex = i
      break
    }
  }

  return lines.map((line, index) => {
    if (index !== targetIndex || !isDiffContentLine(line)) {
      return line
    }

    const prefix = line[0] ?? ""
    const content = line.slice(1)
    return `${prefix}${openToken} ${content}`
  })
}

/**
 * Balance paired delimiters in a unified diff patch for correct syntax
 * highlighting.
 *
 * Pass 1 (tokenize): for each hunk, extract content lines and count
 * delimiter occurrences.
 *
 * Pass 2 (repair): if a hunk has an odd count for any symmetric delimiter,
 * classify the unmatched boundary token as a likely opener or closer and
 * escape that token in place.
 *
 * Pass 3 (hunk isolation): if a hunk leaves an asymmetric delimiter open,
 * append its closing token to the last content line so the next hunk starts
 * from a clean parser state.
 */
export function balanceDelimiters(rawDiff: string, filetype?: string): string {
  if (!filetype) return rawDiff
  const rules = LANGUAGE_DELIMITERS[filetype]
  if (!rules) return rawDiff

  const lines = rawDiff.split("\n")
  const fileHeader: string[] = []
  const hunks: DiffHunk[] = []

  for (const line of lines) {
    if (line.startsWith("@@")) {
      hunks.push({ header: line, lines: [] })
    } else if (hunks.length > 0) {
      hunks[hunks.length - 1]!.lines.push(line)
    } else {
      fileHeader.push(line)
    }
  }

  if (hunks.length === 0) return rawDiff

  const result = [...fileHeader]

  for (const hunk of hunks) {
    const contentLines = getContentLines(hunk.lines)
    let repairedLines = hunk.lines

    for (const rule of rules) {
      if (!isSymmetricRule(rule)) {
        continue
      }

      // Contextual fence pairing (markdown code fences): uses sequential
      // open/close tracking instead of simple odd/even parity.
      if (rule.classifyFence) {
        repairedLines = repairContextualFences(contentLines, repairedLines, rule)
        continue
      }

      const occurrences = findDelimiterOccurrences(contentLines, rule.token)
      if (occurrences.length % 2 === 0) {
        continue
      }

      const first = occurrences[0]
      const last = occurrences[occurrences.length - 1]
      if (!first || !last) {
        continue
      }

      const firstBoundary = classifyOccurrence(contentLines, first, rule.token)
      const lastBoundary = classifyOccurrence(contentLines, last, rule.token)

      if (firstBoundary === "close") {
        repairedLines = escapeDelimiterAt(repairedLines, first.hunkLineIndex, first.column)
        break
      }

      if (lastBoundary === "open") {
        repairedLines = escapeDelimiterAt(repairedLines, last.hunkLineIndex, last.column)
        break
      }
    }

    for (const rule of rules) {
      const unclosedCount = getUnclosedTokenCount(repairedLines, rule)
      if (unclosedCount > 0) {
        repairedLines = appendClosingTokensToLastContentLine(repairedLines, getRuleCloseToken(rule), unclosedCount)
      }
    }

    result.push(hunk.header)
    result.push(...repairedLines)
  }

  return result.join("\n")
}
