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
// Why this is safer than prepending a synthetic opener: prepending fixes hunks
// that begin inside a string, but it corrupts hunks that end inside an open
// string/fence/docstring. Escaping the actual unmatched token keeps the repair
// local and avoids duplicating delimiters like ``` -> ``````.

type BoundaryKind = "open" | "close" | "unknown"

interface DelimiterRule {
  token: string
  closeToken?: string
  openTokens?: string[]
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
  markdown: [{ token: "```" }],
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

  const openCount = findAnyDelimiterOccurrences(contentLines, openTokens).length
  const closeCount = findDelimiterOccurrences(contentLines, closeToken).length
  return Math.max(0, openCount - closeCount)
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
