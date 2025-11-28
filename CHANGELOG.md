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
