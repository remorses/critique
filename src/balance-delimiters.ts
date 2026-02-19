// Delimiter balancing for syntax highlighting in diff hunks.
//
// When a diff hunk starts inside a paired delimiter (template literal,
// triple-quoted string, etc.), tree-sitter sees an odd number of that
// delimiter and misparses everything after the first occurrence.
//
// Two-pass fix:
//   1. Tokenizer: count delimiter occurrences in each hunk's content,
//      skipping escaped characters.
//   2. Fix: if a hunk has an odd count, prepend a balancing delimiter to
//      the first content line so tree-sitter sees balanced pairs.
//
// Why no string/comment state tracking: the tokenizer processes partial
// code (diff hunks) that may start mid-string. Tracking quote states
// causes false positives when template text contains apostrophes
// (`it's`) or quotes (`class="foo"`). Tracking comment states breaks
// on `://` in URL templates. The \-escape handler already covers
// escaped delimiters, and unescaped delimiters in "wrong" contexts
// (strings, comments) are rare enough that the tradeoff is worth it.

/**
 * Delimiters to balance per language filetype.
 *
 * Each entry maps a filetype (from detectFiletype) to the list of
 * delimiters that come in open/close pairs and can span lines.
 */
const LANGUAGE_DELIMITERS: Record<string, string[]> = {
  typescript: ["`"],
  python: ['"""', "'''"],
  go: ["`"],
  scala: ['"""'],
  swift: ['"""'],
  julia: ['"""'],
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
      i += len - 1 // -1 because the loop increments
    }
  }

  return count
}

interface DiffHunk {
  header: string
  lines: string[]
}

/**
 * Balance paired delimiters in a unified diff patch for correct syntax
 * highlighting.
 *
 * Pass 1 (tokenize): for each hunk, extract content lines and count
 * delimiter occurrences.
 *
 * Pass 2 (fix): if a hunk has an odd count for any delimiter, prepend
 * that delimiter to the first content line so tree-sitter sees balanced
 * pairs. No header adjustment needed since no new lines are added.
 */
export function balanceDelimiters(rawDiff: string, filetype?: string): string {
  if (!filetype) return rawDiff
  const delimiters = LANGUAGE_DELIMITERS[filetype]
  if (!delimiters) return rawDiff

  const lines = rawDiff.split("\n")
  const fileHeader: string[] = []
  const hunks: DiffHunk[] = []

  // Split into file header + hunks
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

  // Pass 2: check each hunk and fix if needed
  const result = [...fileHeader]

  for (const hunk of hunks) {
    // Extract content text from diff lines (strip the +/-/space prefix)
    const content = hunk.lines
      .filter(l => l[0] === " " || l[0] === "+" || l[0] === "-")
      .map(l => l.slice(1))
      .join("\n")

    // Find the first delimiter with an odd count
    let unbalanced: string | undefined
    for (const delim of delimiters) {
      if (countDelimiter(content, delim) % 2 !== 0) {
        unbalanced = delim
        break
      }
    }

    result.push(hunk.header)

    if (unbalanced) {
      // Prepend the balancing delimiter to the first content line
      let fixed = false
      for (const line of hunk.lines) {
        if (!fixed && (line[0] === " " || line[0] === "+" || line[0] === "-")) {
          result.push(line[0] + unbalanced + line.slice(1))
          fixed = true
        } else {
          result.push(line)
        }
      }
    } else {
      result.push(...hunk.lines)
    }
  }

  return result.join("\n")
}
