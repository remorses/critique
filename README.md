# critique

A beautiful terminal UI for reviewing git diffs with syntax highlighting, split view, and word-level diff.

<img width="3456" height="2152" alt="image" src="https://github.com/user-attachments/assets/13b9db4c-5b00-4da8-b4a6-104b0dffe956" />


## Installation

> **Note:** critique requires [Bun](https://bun.sh) - it does not work with Node.js.

```bash
# Run directly with bunx (no install needed)
bunx critique

# Or install globally
bun install -g critique
```

## Usage

### View Git Diff

```bash
# View unstaged changes (includes untracked files)
critique

# View staged changes
critique --staged

# View a specific commit
critique --commit HEAD~1
critique abc1234

# Watch mode - auto-refresh on file changes
critique --watch
```

### Navigation

| Key | Action |
|-----|--------|
| `←` / `→` | Navigate between files |
| `↑` / `↓` | Scroll up/down |
| `Ctrl+P` | Open file selector dropdown |
| `Option` (hold) | Fast scroll (10x) |
| `Esc` | Close dropdown |

### Git Difftool Integration

Configure critique as your git difftool:

```bash
git config --global diff.tool critique
git config --global difftool.critique.cmd 'critique difftool "$LOCAL" "$REMOTE"'
```

Then use:

```bash
git difftool HEAD~1
```

### Pick Files from Another Branch

Selectively apply changes from another branch to your current HEAD:

```bash
critique pick feature-branch
```

Use the interactive UI to select files. Selected files are immediately applied as patches, deselected files are restored.

### Web Preview

Generate a shareable web preview of your diff that you can send to anyone - no installation required:

```bash
# Upload to critique.work and get a shareable URL
critique web

# View staged changes
critique web --staged

# View a specific commit
critique web --commit HEAD~1

# Generate local HTML file instead of uploading
critique web --local

# Adjust rendering size (use ~100 cols for mobile-friendly output)
critique web --cols 100 --rows 2000
```

**How it works:**

1. Captures the terminal UI output using a PTY (pseudo-terminal)
2. Converts ANSI escape codes to styled HTML with syntax highlighting
3. Uploads the HTML to [critique.work](https://critique.work) (Cloudflare Worker + KV storage)
4. Returns a shareable URL that expires after 7 days
5. Automatically opens the preview in your browser

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `--staged` | Show staged changes | - |
| `--commit <ref>` | Show changes from a specific commit | - |
| `--cols <n>` | Terminal width for rendering | `240` |
| `--rows <n>` | Terminal height for rendering | `2000` |
| `--local` | Save HTML locally instead of uploading | - |

**Tips:**

- Use `--cols 100` for mobile-friendly output (switches to unified diff view instead of split view)
- The URL is based on a SHA-256 hash of the content, so identical diffs produce the same URL (deduplication)
- If upload fails, critique automatically saves the HTML locally as a fallback

## Features

- **Syntax Highlighting** - Powered by [Shiki](https://shiki.style/) with support for 18+ languages
- **Split View** - Side-by-side comparison for wide terminals (auto-switches to unified view on narrow terminals)
- **Word-Level Diff** - Highlights specific word changes within modified lines
- **File Navigation** - Quick file switcher with fuzzy search
- **Click to Open** - Click line numbers to open in your editor (set `REACT_EDITOR` env var)
- **Watch Mode** - Live updates as you edit files
- **Web Preview** - Generate shareable HTML previews hosted on [critique.work](https://critique.work)
- **Cherry Pick** - Interactive file picker to apply changes from other branches

## Supported Languages

TypeScript, JavaScript, TSX, JSX, JSON, Markdown, HTML, CSS, Python, Rust, Go, Java, C, C++, YAML, TOML, Bash, SQL

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `REACT_EDITOR` | Editor command for click-to-open | `zed` |
| `CRITIQUE_WORKER_URL` | Custom worker URL for web preview | `https://critique.work` |

## Ignored Files

Lock files are automatically hidden from diffs:
- `pnpm-lock.yaml`
- `package-lock.json`
- `yarn.lock`
- `bun.lockb`
- `Cargo.lock`
- `poetry.lock`
- `Gemfile.lock`
- `composer.lock`

Files with more than 6000 lines of diff are also hidden for performance.

## Built With

- [opentui](https://github.com/sst/opentui) - React-based terminal UI framework
- [Shiki](https://shiki.style/) - Syntax highlighting
- [diff](https://github.com/kpdecker/jsdiff) - Diff algorithm
- [Hono](https://hono.dev/) - Web framework for the preview worker

## License

MIT
