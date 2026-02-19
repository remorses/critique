// Backtick balancing for syntax highlighting in diff hunks.
//
// When a diff hunk starts inside a template literal (the opening backtick is
// above the hunk), tree-sitter sees an odd number of backticks and paints
// everything after the first one as a string.
//
// Two-pass fix:
//   1. Tokenizer: count backtick delimiters in each hunk's content, skipping
//      backticks inside comments and escaped chars.
//   2. Fix: if a hunk has an odd count, prepend a balancing backtick to the
//      first content line so tree-sitter sees balanced delimiters.
//
// Why no string state tracking: the tokenizer processes partial code (diff
// hunks) that may start mid-template-literal. Tracking single/double quote
// states causes false positives when template text contains apostrophes
// (`it's`) or quotes (`class="foo"`), which trick the tokenizer into hiding
// the closing backtick. The \-escape handler already covers escaped backticks
// inside strings ('\`'), and unescaped backticks inside regular strings are
// rare enough that the tradeoff is worth it.
//
// Why no comment state tracking: same problem — `://` in URL template
// literals like `${protocol}://${host}` triggers line_comment state,
// hiding the closing backtick. This is extremely common in real code.
// Backticks in real comments are usually in pairs (`value`) so the count
// stays even. The rare odd-backtick-in-comment false positive is a minor
// visual artifact vs the `:// breaks all highlighting` bug.

export type TokenState = "code"

/**
 * Count backtick characters that act as template literal delimiters.
 *
 * Walks character by character, counting unescaped backticks.
 * Escaped characters (\x) are skipped — this handles \` inside template
 * literal content and backticks inside regex patterns like /\`/.
 */
export function countBackticks(code: string): number {
  let count = 0

  for (let i = 0; i < code.length; i++) {
    const ch = code[i]!
    if (ch === "\\") i++
    else if (ch === "`") count++
  }

  return count
}

export interface DiffHunk {
  header: string
  lines: string[]
}

/**
 * Balance backticks in a unified diff patch for correct syntax highlighting.
 *
 * Only applies to TypeScript/JavaScript files (filetype === "typescript").
 *
 * Pass 1 (tokenize): for each hunk, extract content lines and count backtick
 * delimiters using the state machine tokenizer.
 *
 * Pass 2 (fix): if a hunk has an odd count, prepend a backtick to the first
 * content line so tree-sitter sees balanced delimiters. No header adjustment
 * needed since no new lines are added.
 */
export function balanceBackticks(rawDiff: string, filetype?: string): string {
  if (filetype !== "typescript") return rawDiff

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

    const count = countBackticks(content)

    result.push(hunk.header)

    if (count % 2 !== 0) {
      // Prepend a balancing backtick to the first content line
      let fixed = false
      for (const line of hunk.lines) {
        if (!fixed && (line[0] === " " || line[0] === "+" || line[0] === "-")) {
          result.push(line[0] + "`" + line.slice(1))
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
