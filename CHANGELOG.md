# 0.1.47

- Add vim-style keyboard navigation:
  - `G` (Shift+g) - scroll to bottom
  - `gg` (double-tap g) - scroll to top
  - `Ctrl+D` - half page down
  - `Ctrl+U` - half page up
- `review` command: change debug console toggle from `Ctrl+D` to `Ctrl+Z` (consistent with main viewer)

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
