# 0.1.110

- `--filter` with dirty submodules:
  - Apply file glob filters after dirty submodule diffs are merged into the combined diff result
  - Fixes cases where `--filter` matched top-level files but still showed unrelated files coming from submodule diffs
  - Keep compatibility with plain path filters (e.g. `src`, `src/`, `./src`) in the post-merge filtering path
- Commands updated:
  - `critique` (default mode, including `--watch` refreshes)
  - `critique review`
  - `critique hunks list`
  - `critique hunks add`
  - `critique web` (deprecated command)
- Internal cleanup:
  - `buildSubmoduleDiffCommand` now only scopes by submodule paths/context; user file globs are applied in a post-merge filtering pass
  - Add regression tests for filter pattern normalization and post-merge parsed-file filtering
  - Fix parsing for post-filtered patches emitted via `formatPatch` (`Index:` headers), avoiding `unknown +0-0` file entries

# 0.1.109

- Syntax highlighting:
  - Generalize delimiter balancing from backtick-only to any paired delimiter that spans lines
  - Add Python support: balance `"""` and `'''` triple-quoted strings / docstrings
  - Add Go support: balance `` ` `` raw string literals
  - Add Scala, Swift, Julia support: balance `"""` triple-quoted strings
  - Fix: diff hunks starting inside a template literal or docstring no longer cause tree-sitter to misparse subsequent code
- Bug fixes:
  - `--filter`: use single quotes in shell commands so paths containing `$` characters are not shell-expanded
  - `--stdin` (lazygit pager): strip ANSI escape codes from colored diffs before parsing so filenames are not mangled

# 0.1.108

- `hunks add`:
  - Fix bug where staging multiple hunks from the same file failed because line numbers shifted after each `git apply`
  - All selected hunks are now combined into a single patch and applied atomically in one `git apply --cached` call
  - No more need to re-list and re-stage one hunk at a time

# 0.1.107

- `--pdf`:
  - Default to landscape A4 (842x595 pt) instead of portrait for more horizontal space
  - Force split diff view in landscape mode for side-by-side comparison
  - Bump default columns from 140 to 200 in landscape mode
  - New `--pdf-page-size` option to customize page dimensions
    - Presets: `a4-landscape` (default), `a4-portrait`, `a3-landscape`, `a3-portrait`, `letter-landscape`, `letter-portrait`, `legal-landscape`, `legal-portrait`
    - Custom sizes: `WxH` in points (e.g. `1000x600`)
  - Works for both `critique --pdf` and `critique review --pdf`

# 0.1.106

- New `--pdf` flag:
  - Generate PDF documents from diff and review commands
  - `critique HEAD~3 --pdf` writes to /tmp/critique-diff-*.pdf
  - `critique HEAD~3 --pdf output.pdf` writes to specific path
  - `critique review --pdf` generates PDF after AI review completes
  - `--open` flag to launch PDF in default viewer after generation
- PDF rendering:
  - New `opentui-pdf.ts` module converts CapturedFrame to multi-page PDF using pdfkit
  - Smart page breaking at natural section boundaries (empty line sequences)
  - Auto-fits font size to frame width so content never clips horizontally
  - Uses JetBrains Mono Nerd font (ships pre-converted .ttf, 2.4MB)
  - Handles all text attributes: bold, italic, dim, underline, strikethrough
  - Correct positioning of CJK/emoji/wide characters using span.width
  - Default page size: A4 portrait (595x842 pt)
- Dependencies:
  - Add pdfkit as optional dependency (same as takumi)
  - Remove wawoff2 (ship pre-converted .ttf font instead)
  - Move resend to devDependencies (only used by Cloudflare Worker)
- File organization:
  - Move parsers-config.ts, global.d.ts, and queries/ into src/ directory
  - Add dist/ to package.json files array (fixes published package missing compiled files)
- `review --pdf`:
  - Wait for AI generation to complete before exporting PDF
  - Default to github-light theme for better print readability (can override with --theme)
- Tests:
  - Suppress React act() warnings in opentui component tests (expected behavior for TUI testing)
  - Increase DataPathsManager maxListeners to suppress EventTarget memory leak warning in DiffView tests
- Bug fixes:
  - Fix CLI version number display (thanks @tobeycodes for the contribution)

# 0.1.105

- `critique --stdin` / `critique --web`:
  - Only show 'URL is private' notice when generating with --web (fix notice appearing in scrollback/pager output like lazygit where it makes no sense)
- Tests:
  - Add comprehensive integration tests for --stdin pager mode using tuistory (10 test cases covering empty diffs, multiple files, renames, binary files, narrow terminals, etc.)
  - Rewrite lazygit pager test as real integration test that launches critique in a PTY and verifies scrollback output

# 0.1.104

- `critique --stdin` (pager mode):
  - Force scrollback mode for `--stdin` pager usage to fix lazygit integration (#25)
  - When used as a pager (e.g. `critique --stdin` in lazygit), critique now correctly outputs static colored text instead of interactive TUI escape sequences
- `critique`:
  - Fix crash in Bun compiled binaries where terminal TTY `columns`/`rows` report as 0, causing NaN framebuffer dimensions
  - Replace `@opentui/*` npm alias remapping with direct `@opentuah/*` imports

# 0.1.103

- Syntax highlighting:
  - JSON: render punctuation (quotes/brackets/separators) using comment color instead of operator red / full-bright

# 0.1.102

- `critique --web` / `critique web`:
  - Render the upload notice block in a single muted color (no mixed emphasis)

# 0.1.101

- `critique` / `critique --web` / OG images:
  - Pass `addedBg`/`removedBg` alongside content backgrounds so opentui's word-level highlights don't inherit dark defaults on light themes
  - Keep a small `github-light`-only `addedWordBg` override to make added word highlights visible in images

# 0.1.100

- Dependencies:
  - Update `@opentui/core` / `@opentui/react` npm aliases to `@opentuah/*@0.1.88`
  - Remove `@opentuah/core-darwin-arm64` optional dependency (core pulls the correct platform binary via its own optional deps)

# 0.1.99

- `critique` / `critique review` / `critique web` / `critique hunks list`:
  - Define `--filter <pattern>` as an array schema in goke so repeated flags are parsed explicitly as `string[]`
- `critique review`:
  - Define `--session <id>` as an array schema so repeated session flags are handled natively

# 0.1.98

- Dependencies:
  - Replace `@xmorse/cac` with `goke` for CLI argument parsing

# 0.1.97

- `README`:
  - Make the `CodeRabbit` sponsor text clickable while keeping the compact logo link

# 0.1.96

- `README`:
  - Add a bottom `Sponsors` section with a compact CodeRabbit logo link to `https://coderabbit.link/remorses`

# 0.1.95

- Syntax highlighting:
  - `json`:
    - Color JSON quote characters (`"`) separately as `punctuation.delimiter` while keeping string text highlighted as `property` (keys) and `string` (values)

# 0.1.94

- Syntax highlighting:
  - Fix JSON syntax highlighting by using local query file with captures compatible with themes.ts (nvim-treesitter uses incompatible `#set!` and `#eq?` predicates)
  - Fix syntax highlighting in web preview by pre-initializing TreeSitter client before rendering

# 0.1.93

- Dependencies:
  - Update `@opentui/core` and `@opentui/react` npm aliases to `@opentuah/*@^0.1.81`

# 0.1.92

- `critique`:
  - Keep dropdown search on `<textarea>` and fix filtering by syncing `plainText` from `onContentChange` in a microtask, plus extract shared filtering logic for deterministic matching across theme/file pickers
  - Make watch-mode loading/empty backgrounds reactive to the selected theme by subscribing to `useAppStore` instead of reading `getState()` once
- `critique pick`:
  - Use the active global theme for picker UI colors instead of always forcing the default theme
- `diff rendering`:
  - Remount the `DiffView` wrapper on theme changes so internal diff backgrounds refresh more reliably when switching themes
- Tests:
  - Add `src/components/diff-view.test.tsx` to verify theme-switch background updates in `DiffView`
  - Add dropdown filtering coverage via exported `filterDropdownOptions` tests in `src/dropdown.test.tsx`

# 0.1.91

- `critique`:
  - Improve main diff layout scrolling behavior by allowing the scrollbox to shrink within the column layout (`flexShrink: 1`)
- Tests:
  - Add `src/cli-scroll.test.tsx` using opentui test renderer to verify mouse-wheel scrolling changes visible content in the main diff view
  - Guard CLI entrypoint parsing with `import.meta.main` and export `App`/`AppProps` to support renderer-driven CLI view tests

# 0.1.90

- `critique`:
  - Fix dropdown search input in file/theme pickers by switching to `<input onInput>` so typed text filters options immediately
  - Ensure diff internals fully refresh on theme change by remounting `<diff>` when `themeName` changes
  - Make loading/empty-state backgrounds reactive to theme changes in watch mode
- `critique pick`:
  - Use the currently selected global theme instead of always forcing the default theme
- Tests:
  - Add a dropdown regression test that reproduces and verifies theme search filtering
  - Add a DiffView regression test that verifies diff background colors actually change after a runtime theme switch

# 0.1.89

- `critique`:
  - Keep the main diff scrollbox focused so mouse-wheel scrolling works reliably in the default diff view

# 0.1.88

- Dependencies:
  - Keep `@opentui/*` imports/package names and install Jake's fork via npm alias mapping
  - Map `@opentui/core` -> `npm:@opentuah/core@latest` and `@opentui/react` -> `npm:@opentuah/react@latest`

# 0.1.87

- `hunks`:
  - `critique hunks add <id>` now appends dirty submodule diffs before hunk lookup
  - Fixes mismatch where IDs listed by `critique hunks list` for submodule changes could fail with "Hunk not found"

# 0.1.86

- New `hunks` commands for non-interactive selective staging:
  - `critique hunks list` - list all hunks with stable IDs
  - `critique hunks add <id>` - stage specific hunks by ID
  - `--staged` flag to list staged hunks
  - `--filter` flag to filter by file pattern
  - Hunk IDs use format `file:@-old,len+new,len` (stable across runs)
  - Uses `diff` npm package for reliable parsing instead of shell/awk
- Switch to `@xmorse/cac` fork for space-separated subcommand support

# 0.1.85

- Docs: remove undocumented `--local` option from README (fixes #24)

# 0.1.84

- New `--scrollback` option: output diff to terminal scrollback instead of interactive TUI
  - Renders using opentui test renderer and converts to ANSI escape sequences
  - Auto-detects terminal color support (truecolor → 256 → 16 → plain text)
  - Respects `FORCE_COLOR` and `NO_COLOR` environment variables
  - Outputs plain text when piped (non-TTY)
- Add `supports-color` dependency for terminal capability detection

# 0.1.83

- Internal:
  - Update opentui to 0.1.77
  - Simplify span capture: use opentui's built-in `getSpanLines()` instead of custom implementation
  - Remove ~60 lines of duplicated span capture code in `web-utils.tsx`

# 0.1.82

- `--web`:
  - Content-fitting for HTML rendering: starts with small buffer (100 rows), doubles until content fits, then shrinks to exact size
  - Reduces memory usage for small diffs while still supporting large ones
  - Rename `CaptureOptions.rows` to `maxRows` to clarify it's the upper bound for buffer growth

# 0.1.81

- `review`:
  - Fix diagram overflow expanding container width - long diagrams now truncate from right instead of shifting all content left
  - Update AI prompt: diagrams should be under 70 chars wide, prose must be outside code blocks

# 0.1.80

- OG images:
  - Increased default font size from 16px to 20px for better readability
  - Fixed text clipping by adding flexShrink 0 to all elements
  - Always use github-light theme (no dark mode support in OG protocol)
  - `review --web` now generates OG images from the first few hunks of the diff
  - Fixed `buildPatch` to include `diff --git` header for proper diff parsing

# 0.1.79

- TUI:
  - `critique`: Esc closes file/theme dropdowns before exiting
  - `critique`: Add dropdown escape handling test coverage
  - `critique review`: Esc closes the theme picker dropdown before exiting

# 0.1.78

- **Breaking change:** Single positional argument now uses `git diff` instead of `git show`
  - Aligns with `git diff` behavior: `critique <ref>` compares ref to working tree
  - Before: `critique HEAD~1` showed what HEAD~1 commit introduced (just that commit)
  - After: `critique HEAD~1` shows all changes since HEAD~1 (like `git diff HEAD~1`)
  - Examples with `critique HEAD~N`:
    ```
    history:  ...---A---B---C  <- HEAD
                           \
                            + uncommitted (if any)

    critique HEAD~2  =  shows B + C + uncommitted
    critique HEAD~1  =  shows C + uncommitted
    critique HEAD    =  shows only uncommitted (empty if none)
    ```
  - Examples with `critique <branch>` (when on feature branch):
    ```
    main:     A---B---C
                       \
    feature:            D---E---F  <- HEAD
                                 \
                                  + uncommitted (if any)

    critique main  =  shows D + E + F + uncommitted
    ```
  - To get the previous behavior (view a specific commit only), use `--commit`:
    ```
    critique --commit HEAD~1  =  shows only what HEAD~1 introduced (just that commit)
    critique --commit abc123  =  shows only what abc123 introduced
    ```
  - Two positional arguments unchanged: `critique main feature` still uses three-dot syntax

# 0.1.77

- Web previews:
  - Add favicon support with automatic light/dark mode switching
  - Dark mode shows white diff icon, light mode shows black diff icon

# 0.1.76

- Syntax highlighting:
  - Add tree-sitter parsers for 21 additional languages: Python, Rust, Go, C++, C#, Bash, C, Java, Ruby, PHP, Scala, HTML, JSON, YAML, Haskell, CSS, Julia, OCaml, Clojure, Swift, Nix

# 0.1.75

- Web previews:
  - Add left padding to the expiry notice
  - Linkify URLs in HTML output (clickable links in web previews)

# 0.1.70

- Web previews:
  - Tweak expiry notice styling to remove padding and borders

# 0.1.69

- Web previews:
  - Render expiry notice in TUI JSX with plain left-aligned text

# 0.1.68

- Web previews:
  - `--web`: render expiry notice in the TUI JSX output before HTML generation

# 0.1.67

- Web previews:
  - Remove expiry banner injection from HTML generation

# 0.1.66

- Web previews:
  - `--web`: inject expiry banner during HTML generation instead of in the worker

# 0.1.65

- Worker:
  - `view`: add `showExpiration=1` query param to render expiry banner on demand

# 0.1.64

- Web previews:
  - `--web`: show purchase URL after expiry notice for non-licensed uploads

# 0.1.63

- Worker:
  - `view`: add expiry banner to expiring pages with link to subscription

# 0.1.62

- Worker:
  - Add Resend reply-to and tag metadata for license emails

# 0.1.61

- Worker:
  - Email the license command via Resend on successful checkout
  - Success page shows the `npx critique login <key>` command

# 0.1.60

- Tooling:
  - Add `worker:secrets` script to upload Cloudflare secrets from `.env`

# 0.1.59

- Worker:
  - `buy`: use Stripe SDK for checkout session creation

# 0.1.58

- Worker:
  - `buy`: log Stripe checkout errors and return status details in response

# 0.1.57

- Worker:
  - Centralize all KV reads/writes in a dedicated storage helper

# 0.1.56

- Worker:
  - Add JS entrypoint shim for Wrangler deploy

# 0.1.55

- Worker:
  - `buy`: update Stripe yearly price ID

# 0.1.54

- Worker:
  - `buy`: hardcode yearly Stripe price ID for the Critique subscription

# 0.1.53

- Web previews:
  - `--web`: allow licensed uploads to never expire via stored license key
  - `review --web` and `review --resume --web`: show never-expire status from worker
- CLI:
  - `login`: store Critique license key in `~/.critique/license.json`
- Worker:
  - Add Stripe subscription routes and KV-backed license validation for permanent links

# 0.1.52

- Tests (OG images):
  - Write example OG image to `tmp/og-examples/og-example.png`

# 0.1.51

- New `--image` flag for diff command:
  - Generates WebP images of terminal output (saved to /tmp)
  - Splits long diffs into multiple images (70 lines per image)
  - Uses takumi for high-performance image rendering
  - `@takumi-rs/core` and `@takumi-rs/helpers` added as optional dependencies
  - Library exports: `renderFrameToImages`, `renderDiffToImages`, `renderReviewToImages` from `critique/src/image.ts`

# 0.1.50

- `review` command: Fix visual gaps in ASCII diagrams
  - Convert `|` to `│` (Unicode vertical line) - eliminates gaps between rows
  - Convert `--` or longer to `──` (Unicode horizontal line)
  - Single hyphens preserved (e.g. "web-render" stays intact)

# 0.1.49

- Add copy selection on mouseup: text selected with the mouse is automatically copied to clipboard when released
  - Works across all TUI modes (diff viewer, review, loading states)
  - Uses native clipboard commands (pbcopy, xclip, wl-copy) with OSC52 fallback for SSH
  - New `useCopySelection` hook in `src/hooks/use-copy-selection.ts`
- Disable click-to-scroll on directory tree files (conflicts with copy selection)

# 0.1.48

- Web rendering improvements:
  - Fix review height estimation to use same row multiplier as regular diff capture (prevents scrollbars)
  - Fix diagram wrapping by passing `renderer` prop to enable custom `renderNode` with `wrapMode: "none"`
  - Remove `ghostty-opentui` dependency, use opentui test renderer directly for HTML generation
- `review` command:
  - Diagram code blocks (`lang="diagram"`) now use `wrapMode: "none"` to prevent line wrapping
  - Added `flexShrink: 0` and `overflow: "hidden"` to diagram line boxes
- Internal: Remove `web-render` and `review-web-render` CLI subcommands (replaced by test renderer approach)

# 0.1.47

- Add vim-style keyboard navigation:
  - `G` (Shift+g) - scroll to bottom
  - `gg` (double-tap g) - scroll to top
  - `Ctrl+D` - half page down
  - `Ctrl+U` - half page up
- `review` command: change debug console toggle from `Ctrl+D` to `Ctrl+Z` (consistent with main viewer)
- Fix theme loading on Windows by using `fileURLToPath` for proper path conversion

# 0.1.46

- Add directory tree view at top of diff TUIs (default, review, web commands)
- Switch opentui packages to npm releases (from pkg.pr.new preview URLs)
- Add missing `marked` dependency
- Fix Q and Escape keys not working to exit when there are no changes to display (fixes #16)

# 0.1.45

- Support git range syntax in single argument: `critique origin/main...HEAD` or `critique main..feature`

# 0.1.44

- Fix parsing error with submodule status lines:
  - Handle "Submodule name contains modified content" lines
  - Handle "Submodule name contains untracked content" lines
  - Handle "Submodule name (new commits)" and similar status lines

# 0.1.43

- Show full submodule diffs instead of just commit hashes:
  - Added `--submodule=diff` flag to git commands
  - Strip submodule header lines (`Submodule name hash1..hash2:`) before parsing
  - Works with TUI, `--web`, and `review` commands

# 0.1.42

- New `--image` flag for all diff commands:
  - Generates WebP images of terminal output (saved to /tmp)
  - Splits long diffs into multiple images (70 lines per image)
  - Uses takumi for high-performance image rendering
  - `@takumi-rs/core` and `@takumi-rs/helpers` added as optional dependencies
  - Library export: `import { renderTerminalToImages } from "critique/src/image.ts"`
- Web output: Use default theme to enable dark/light mode switching based on system preference
- `review` command:
  - Improved AI prompt: order hunks by code flow, think upfront before writing, split heavy logic across sections
- Dependencies:
  - Update opentui to `367a9408`

# 0.1.41

- `review` command:
  - Filter `--resume` reviews by current working directory (only shows reviews from cwd or subdirectories)
  - Use ACP `unstable_listSessions` for OpenCode instead of parsing JSON files directly
  - Falls back to file-based parsing for Claude Code when ACP method unavailable
  - Add instruction to always close code blocks before new text (fixes unclosed diagram blocks)

# 0.1.40

- `review` command:
  - Increased session/review picker limits from 10/20 to 25 for both ACP sessions and `--resume`

# 0.1.39

- `review` command:
  - Enhanced splitting rules in system prompt: never show hunks larger than 10 lines
  - Added files must be split into parts with descriptions for each function/method
  - More aggressive chunk splitting for reduced cognitive load
  - Track review status: `in_progress` (interrupted) or `completed`
  - Interrupted reviews saved on Ctrl+C/exit and can be restarted via `--resume`
  - Use ACP session ID as review ID
  - Show status indicator in review picker (yellow for in progress)
  - JSON file only written on exit/completion to prevent concurrent access issues

# 0.1.38

- `review` command:
  - Add `--resume` flag to view previously saved reviews
  - Reviews are automatically saved to `~/.critique/reviews/` on completion
  - Select from recent reviews with interactive picker (ordered by creation time)
  - Resume supports `--web` flag to generate shareable URL
  - AI now generates a `title` field in YAML for better review summaries
  - Keeps last 50 reviews, auto-cleans older ones

# 0.1.37

- `review` command:
  - Add `--model <id>` option to specify which model to use for review
  - Model format depends on agent:
    - OpenCode: `provider/model-id` (e.g., `anthropic/claude-sonnet-4-20250514`)
    - Claude Code: `model-id` (e.g., `claude-sonnet-4-20250514`)
  - Shows available models with helpful error message if invalid model specified

# 0.1.36

- `review` command:
  - Use Unicode filled arrows (`▶`, `◀`, `▼`) in diagram examples for proper parsing
  - Use `secondary` theme color for diagram text (purple in github theme)

# 0.1.35

- Dependencies:
  - Update opentui to `302acd5f`

# 0.1.34

- `review` command:
  - Add diagram parser to extract and render diagrams from AI descriptions
  - Show generating indicator below last hunk with animated spinner and dots
  - Use "diagram" language in system prompt for code blocks
- Web preview:
  - Fix text selection by switching from flex to block layout for lines
- UI:
  - Fix layout shift in session multiselect by moving time ago to label
- Themes:
  - Add "conceal" color support

# 0.1.33

- Dependencies:
  - Fix opentui package URLs to use full commit hashes for consistent resolution

# 0.1.32

- Dependencies:
  - Update opentui to `070b0cd` (improved word highlights algorithm, GitHub Desktop-style)
- Docs:
  - Add instructions for using pkg.pr.new preview URLs with commit hashes

# 0.1.31

- Diff view:
  - Add word-level highlighting for changed lines (shows exactly which words were added/removed)
- Dependencies:
  - Update opentui to `77f314bf` with word-highlights support

# 0.1.30

- Dependencies:
  - Switch opentui packages from PR number (`@433`) to commit hash (`@203f75b8...`) to fix Yoga binding mismatch between `@opentui/core` and `@opentui/react`
  - Remove `overrides` section from package.json (no longer needed with matching versions)
- Web preview:
  - Fix iOS Safari rendering issues by disabling `content-visibility` optimization via `@supports (-webkit-touch-callout: none)`

# 0.1.29

- Web preview:
  - Switch to JetBrains Mono Nerd Font for better box-drawing character rendering (connected vertical lines in diagrams)
  - Self-host font as woff2 on critique.work instead of Google Fonts (986KB, converted from 2.4MB TTF)
- Worker:
  - Add static asset serving for fonts via `assets.directory` config

# 0.1.28

- Default command:
  - Add `--stdin` option to read diff from stdin (for lazygit pager integration)
  - Faster scroll acceleration (`A: 1.5`, `maxMultiplier: 10`)
- `review` command:
  - Remove hunk ID prefix (`#1`, `#2`) from hunk headers
  - Faster scroll acceleration (`A: 1.5`, `maxMultiplier: 10`)
  - Code blocks now use `wrapMode: "none"` to prevent word-wrapping (content truncates at viewport edge instead)
  - Prose max width now respects terminal width: `Math.min(80, width)`
  - Code blocks use full terminal width minus padding
- Tests:
  - Added test for code block wrapMode behavior with renderer

# 0.1.27

- GitHub theme:
  - Reduce intensity of diff added/removed background colors for softer appearance

# 0.1.26

- `review` command:
  - Make filename bold in hunk header
  - Add gap of 1 between filename header and diff

# 0.1.25

- Default command:
  - Change file picker shortcut from `ctrl p` to plain `p`
  - Make `--web` bold in footer for better visibility
- `review` command:
  - Make `--web` bold in footer for better visibility

# 0.1.24

- Default command:
  - Add `--web [title]` flag to generate web preview instead of TUI
  - Add `--open` flag to open in browser (with `--web`)
  - Add `--theme <name>` flag to set theme (works for both TUI and web)
  - Add `--cols` and `--mobile-cols` flags for web render dimensions
  - Show all files in scrollable view instead of one-at-a-time pagination
  - `ctrl p` dropdown now scrolls to selected file
  - Add "--web to share & collaborate" tip to footer
- `review` command:
  - Add "--web to share & collaborate" tip to footer
- Deprecate `web` command (use `--web` flag instead)

# 0.1.23

- `review` command:
  - Add `gap` prop to `ReviewAppView` to control spacing between markdown descriptions and hunks (default: 2)

# 0.1.22

- Use `<markdown>` component instead of `<code filetype="markdown">` for rendering markdown content:
  - `review` command: MarkdownBlock component
  - `stream-display`: Message blocks
- Update opentui to PR #433 with MarkdownRenderable support
- Variable-width markdown rendering in `review` command:
  - Prose (headings, paragraphs, lists) constrained to 80 chars, centered
  - Code blocks and tables expand to full available width, centered
  - Uses `renderNode` callback to customize block rendering
  - Added test for wide code blocks and tables
- Add example diagrams and tables to `scripts/preview-review.tsx`

# 0.1.21

- `review` command:
  - Add clack spinners for analysis start and tool call activity
  - Show file names for read/write/edit tool logs
  - Show animated "generating..." indicator in the TUI footer
  - Add spinner while loading session context
  - Upgrade `@clack/prompts` for taskLog support

# 0.1.20

- Add theme picker to `review` command:
  - Press `t` to open theme picker with live preview
  - Theme selection persisted and shared with main diff view
- Extract zustand store to `src/store.ts`:
  - Shared state between main diff view and review view
  - Theme changes auto-persist to `~/.critique/state.json`
- Fix diff background colors:
  - Wrap diff component in box with theme background color
  - Ensures no black/transparent gaps in diff view
- Fix theme reactivity in DiffView:
  - Memoize resolved theme and syntax style properly
- Fix Dropdown component:
  - Add `focused` prop for proper focus management
  - Fix stale closure issue in move/onFocus callbacks
  - Separate useEffect for selection changes to fix theme preview reactivity
- Fix hardcoded colors in review UI:
  - Scrollbar, footer, and hunk headers now use theme colors
- Add `scripts/preview-review.tsx` for standalone review component testing
- Simplify generating indicator (show only animated dots)

# 0.1.19

- `review` command:
  - Pass `_meta: { critique: true }` when creating review sessions for future filtering support
  - Filter out critique-generated sessions from context selection (by `_meta` or title pattern)

# 0.1.18

- Replace `@xmorse/bun-pty` with `bun-pty` (official package)
- Remove unused dependencies: `react-error-boundary`, `node-pty`, `shiki`, `@shikijs/langs`, `@shikijs/themes`
- Remove unused `highlight.tsx` example file

# 0.1.17

- Rename `explain` command to `review`
- Add Claude Code support:
  - `critique review --agent claude` to use Claude Code instead of OpenCode
  - Session listing works for both agents
- `web` command:
  - Use Fira Code font from Google Fonts for better box drawing character rendering
- Update `ghostty-opentui` to v1.3.12

# 0.1.16

- `explain` command:
  - Add explicit instruction that diagrams must be wrapped in code blocks

# 0.1.15

- `explain` command:
  - Add `--web` flag to generate web preview instead of TUI
  - Add `--open` flag to open web preview in browser
  - Web mode waits for full AI generation before rendering
  - Hide keyboard shortcuts footer in web mode
- New `src/web-utils.ts` module:
  - Shared utilities for web preview generation
  - `captureToHtml` - PTY capture and ANSI to HTML conversion
  - `captureResponsiveHtml` - Generate desktop and mobile versions
  - `uploadHtml` - Upload to critique.work worker
  - `openInBrowser` - Platform-specific browser opening
  - `writeTempFile` / `cleanupTempFile` - Temp file helpers
- Refactored `web` command to use shared utilities
- Fix markdown syntax highlighting in review mode:
  - Add markdown colors to theme resolution
  - Add Tree-sitter markdown scopes (markup.heading, markup.bold, etc.)
- Fix empty space in web preview rendering:
  - Add `minHeight: 0` to scrollbox contentOptions
  - Replace `height: 100%` with `flexGrow: 1` for flexible layout
  - Add `showFooter` prop to ReviewAppView for web mode

# 0.1.14

- New `explain` command:
  - AI-powered diff explanation and review using ACP (Agent Client Protocol)
  - Usage: `critique explain [base] [head]`
  - Options:
    - `--agent <name>` - AI agent to use (default: opencode)
    - `--staged` - Explain staged changes
    - `--commit <ref>` - Explain changes from a specific commit
    - `--filter <pattern>` - Filter files by glob pattern
  - Features:
    - Parses git diff into indexed hunks with unique IDs
    - Connects to opencode via ACP to analyze changes
    - AI groups related hunks and generates markdown descriptions
    - Streams results as YAML file is updated
    - Renders scrollable TUI with prose descriptions above each hunk group
    - Supports keyboard navigation (j/k or arrows) between groups
    - Uses split view for hunks with both additions and deletions
    - Centers prose descriptions with max-width 80
  - New dependencies: `js-yaml`, `@agentclientprotocol/sdk`
- New `src/review/` module:
  - `acp-client.ts` - ACP client for opencode communication
  - `hunk-parser.ts` - Parse diffs into indexed hunks with `buildPatch`/`createHunk` helpers
  - `session-context.ts` - Compress sessions for AI context
  - `yaml-watcher.ts` - Watch and parse streaming YAML output
  - `review-app.tsx` - TUI component for review mode
  - `review-app.test.tsx` - Inline snapshot tests using opentui test renderer
- New `src/components/` module:
  - `diff-view.tsx` - Shared DiffView component extracted from cli.tsx

# 0.1.13

- Docs:
  - Enhance web preview section in README
  - Add `/v/` short URL alias documentation

# 0.1.12

- Web preview:
  - Add client-side mobile detection with redirect to `?v=mobile`
  - Simplify worker: redirect mobile devices instead of content negotiation
  - Remove `Vary` header - URL now determines content, better caching
  - Increase cache max-age to 24h (was 1h)

# 0.1.11

- All commands:
  - Add support for passing file filters as positional args after `--` (e.g. `critique web -- src/cli.tsx`)
- Web command:
  - Add `--title` option for custom HTML document title
  - Add scrollbar styling to HTML output (dark/light mode aware)

# 0.1.10

- Default command:
  - Add `--filter <pattern>` option to filter files by glob pattern (e.g. `critique --filter 'src/**/*.ts'`)
- Web command:
  - Add support for comparing two refs: `critique web <base> <head>`
  - Add `--filter <pattern>` option to filter files by glob pattern
  - Add auto light/dark mode based on system preference (uses CSS `prefers-color-scheme`)
  - Disabled when `--theme` is specified
  - Fix browser rendering for Safari/Chrome subpixel issues
- Themes:
  - Change default theme to `github` (dark)
  - Fix opencode theme line number contrast (was nearly invisible on dark background)

# 0.1.9

- Performance:
  - Lazy-load themes: Only the default (github) theme is loaded at startup; other themes load on-demand when selected
  - Lazy-load `@parcel/watcher`: Native file watcher module is only loaded when `--watch` flag is used
  - Parallelize `diff` module import with renderer creation
- Web preview:
  - Generate desktop and mobile HTML versions in parallel
  - Add `--mobile-cols` option (default: 100) for mobile column width
  - Add `--theme` option to specify theme for web preview
  - Worker auto-detects mobile devices via `CF-Device-Type`, `Sec-CH-UA-Mobile`, or User-Agent regex
  - Add `?v=desktop` / `?v=mobile` query params to force a specific version
  - Mobile version uses more rows to accommodate line wrapping
- Themes:
  - Add `opencode-light` theme - light mode variant of OpenCode theme
  - Change default theme from `github` to `opencode-light`
  - Web preview now uses theme-aware colors (background, text, diff colors)
  - Theme is changeable via state (press `t` in TUI to pick theme)

# 0.1.8

- Web preview:
  - Enable text wrapping in opentui diff component (`wrapMode="wrap"`)
  - Revert HTML CSS wrapping (caused broken backgrounds on wrapped lines)
  - Remove `www.` from preview URLs

# 0.1.7

- Web preview:
  - Enable text wrapping for long lines (`pre-wrap`, `word-break: break-all`, `flex-wrap: wrap`)

# 0.1.6

- Web preview:
  - Fix horizontal centering using flexbox on body instead of margin auto

# 0.1.5

- Web preview:
  - Switch to `ghostty-opentui` for unlimited scrollback (fixes truncation on large diffs)
  - Dynamically calculate rows from diff content instead of hardcoded limit
  - Add `--open` flag to open browser (disabled by default)
  - Center container horizontally with `max-width: 100vw` (fixes iPad overflow)
  - Set line background color to reduce Safari content-visibility flicker
  - Reduce min font size from 8px to 4px for better mobile fit
  - Fix JSX syntax error (`treeSitterClient={undefined}`)

# 0.1.4

- Web preview:
  - Fix syntax highlighting not appearing in web output
  - Allow multiple renders before capturing (syntax highlighting is async)
  - Use debounced exit (300ms after last render) instead of blocking re-renders

# 0.1.3

- Themes:
  - Reduce intensity of diff added/removed background colors in GitHub theme for better readability

# 0.1.2

- Branch comparison:
  - Document two-ref comparison: `critique <base> <head>`
  - Uses three-dot syntax (like GitHub PRs) to show what head added since diverging from base
- Syntax highlighting:
  - Fix filetype detection to match available tree-sitter parsers
  - Map all JS/TS/JSX/TSX to `typescript` parser (handles all as superset)
  - Map JSON to `javascript` parser (JSON is valid JS)
  - Return `undefined` for unsupported extensions instead of passing them through

# 0.1.0

- Diff view:
  - Use unified view for fully added or fully deleted files (split view would have one empty side)
- Theme preview:
  - Fix black background in scrollbox areas by using theme background color instead of transparent

# 0.0.29

- Persist theme preference to `~/.critique/state.json`
  - Theme selection is restored on next launch
  - Directory is created automatically if missing

# 0.0.28

- Default command:
  - Add support for comparing two git refs: `critique <base> <head>`
  - Uses three-dot notation (`base...head`) to show changes since branches diverged (GitHub PR-style diff)

# 0.0.26

- Web preview:
  - Add `text-size-adjust: 100%` CSS to prevent mobile browsers from auto-scaling text

# 0.0.25

- Change default worker URL to https://critique.work/

# 0.0.24

- Worker:
  - Increase ID length from 16 to 32 hex chars (128 bits) for better security against guessing
  - Backwards compatible: accepts both old 16-char and new 32-char IDs

# 0.0.23

- Web preview:
  - Use unified diff (instead of split view) when `--cols < 150` for better mobile readability

# 0.0.22

- Web preview:
  - Rename `--width`/`--height` options to `--cols`/`--rows` for clarity
  - Add hint in help text: use `--cols ~100` for mobile-friendly output

# 0.0.21

- Update `@xmorse/bun-pty` to 0.4.0

# 0.0.20

- Move `@xmorse/bun-pty` from devDependencies to dependencies (required at runtime for `web` command)

# 0.0.19

- Web preview:
  - Add `content-visibility: auto` with `contain-intrinsic-block-size: auto 1lh` for better rendering performance on large diffs
  - Debounce resize handler (100ms) for smoother font size adjustments
  - Trim lines with only whitespace from the end (not just empty lines)

# 0.0.18

- Web preview:
  - Rewrite ANSI-to-HTML conversion using `ptyToJson` instead of `ptyToHtml` for full control over output
  - Render each terminal line as a separate `<div>` element to prevent color bleeding between lines
  - Use flexbox layout for lines so background colors extend to full line height (no stripes)
  - Trim empty lines from the end of output
  - Add responsive font sizing that adjusts based on viewport width and column count (8px-16px range)
  - Increase line-height to 1.6 for better readability
- Split view:
  - Fix background color bleeding by always setting explicit background color on empty lines

# 0.0.17

- Web preview:
  - Use `ptyToHtml` from opentui-ansi-vt@1.2.10 instead of custom ANSI-to-HTML conversion
  - Simplify `ansiToHtml` to be a thin wrapper around the native implementation
  - HTML now uses CSS variables for color palette (better theming support)
- Cleanup:
  - Remove unused `web/` directory and `vite.config.ts`
  - Remove redundant `scripts/` directory (generate-html.tsx, capture-example.ts)
  - Fix TypeScript errors in `ansi-html.ts`

# 0.0.16

- Web preview:
  - Replace ghostty-web with opentui-ansi-vt for ANSI to HTML conversion
  - Add Cloudflare Worker for hosting previews with KV storage (7-day expiration)
  - Use `content-visibility: auto` for improved performance on large diffs
  - Stream HTML responses for faster initial load
  - Add `--local` flag to save HTML locally instead of uploading
  - Remove dependency on GitHub CLI (`gh`) for gist uploads
- New packages:
  - `@critique/worker` - Cloudflare Worker with Hono routes
    - `POST /upload` - Upload HTML and get shareable URL (hash-based deduplication)
    - `GET /view/:id` - Stream HTML content with caching
- CLI:
  - Increase default width to 240 and height to 2000 for better web rendering
  - Auto-open browser after upload
  - Fallback to local file if upload fails

# 0.0.15

- Web preview:
  - Add `web` command to generate shareable web preview of diffs
  - Add `web-render` command for internal PTY capture
  - Uses ghostty-web to render ANSI terminal output in the browser
  - Captures TUI output via node-pty and uploads to GitHub gist
  - Automatically starts local vite server at http://localhost:3000
  - Supports `--staged`, `--commit <ref>`, `--width`, `--height` options
  - Import ANSI content from file instead of hardcoding
  - Fix screen clear sequence (`ESC[H ESC[J`) breaking ghostty-web rendering
- New scripts:
  - `bun run web` - Start vite dev server for web preview
  - `bun run web:build` - Build web preview for production
  - `scripts/capture-example.ts` - Generate example ANSI output for web preview

# 0.0.14

- Default command:
  - Fix `/dev/null` appearing as filename for new/deleted files
  - Simplify top navigation by removing "prev file" and "next file" text labels
  - Move file counter from top to bottom navigation bar next to "select file"

# 0.0.13

- Default command:
  - Add file selector dropdown with `ctrl+p` or click on filename
  - Display additions/deletions count next to filename (+3-5 format)
  - Add bottom navigation bar with navigation hints
  - Improve navigation header layout with "prev file" and "next file" labels
  - Add consistent background color throughout UI
  - Add padding to top and bottom navigation rows
  - Vertically center dropdown when opened
- UI:
  - Change theme primary color from blue to orange (#FFA500)
  - Update all accent colors to orange

# 0.0.12

- Default command:
  - Show one file at a time with navigation arrows (← filename →)
  - Use left/right arrow keys to navigate between files
  - Persist current file selection in zustand state across watch refreshes
  - Files are sorted by diff size (smallest first)

# 0.0.11

- Dependencies:
  - Update @opentui/core and @opentui/react from 0.1.30 to 0.1.44
  - Update shiki and related packages from 3.14.0 to 3.15.0
- All commands:
  - Migrate from deprecated `render()` to `createRoot()` API
  - Use `wrapMode="none"` instead of deprecated `wrap={false}` prop
  - Add scroll acceleration support to scrollbox components

# 0.0.10

- Default command:
  - Include untracked files in diff using `git add -N`

# 0.0.9

- Default command:
  - Increase max lines for diff display

# 0.0.8

- Default command:
  - Show "Loading..." instead of "No changes to display" on initial load

# 0.0.7

- Default command:
  - Add `--watch` flag to enable live refresh on file changes
  - Sort files by diff size (smallest first)
  - Hide files with more than 1000 lines of diff
  - Ignore lock files (pnpm-lock.yaml, package-lock.json, etc.)
  - Replace React.createElement with JSX syntax

# 0.0.6

- Simplify Dropdown component with options prop instead of descendants pattern
- Add pagination support with configurable items per page (default 10)
- Implement multi-word search with space-separated terms (intersection)
- Detect and display conflict messages when patches create merge conflicts
- Handle new files created by patches (delete on deselect instead of checkout)
- Add file path prefix "/" in dropdown display

# 0.0.5

- Fix patch application to use merge-base for correct ahead-only commits
- Use `git checkout HEAD` for reliable file restoration on deselect
- Improve error messages with full stderr output
- Add `execSyncWithError` wrapper for better error handling
- Support multi-select with array-based selected values in Dropdown

# 0.0.4

- Add `pick` command to selectively apply files from another branch using interactive UI
- Use Dropdown component with search and keyboard navigation
- Apply/restore patches on select/deselect with live preview
- Support conflict detection and 3-way merge
- Show error messages in UI

# 0.0.3

- Add `pick` command to selectively apply files from another branch
- Use autocomplete multiselect for file selection
- Support conflict detection and 3-way merge

# 0.0.2

- Add support for pick command
