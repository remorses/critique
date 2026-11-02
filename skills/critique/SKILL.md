---
name: critique
description: >
  Git diff viewer. Renders diffs as web pages, images, and PDFs
  with syntax highlighting. Use this skill when working with critique for showing
  diffs, generating diff URLs, or selective hunk staging.
---

# critique

Git diff viewer that renders diffs as **web pages**, **images**, and **PDFs** with syntax highlighting.

Agents running in headless environments (kimaki on Discord, openclaw on Slack/Telegram) have no terminal to show diffs. critique uploads diffs to critique.work and returns a shareable URL you can paste into chat. Users click the link and see a syntax-highlighted split-view diff with mobile support and dark/light mode — no install needed.

**Always run `critique --help` first** to see the latest flags and commands. The help output is the source of truth.

## Web — shareable diff URLs

Always pass a title to describe what the diff contains.

```bash
# Working tree changes
critique --web "Add retry logic to database connections"

# Staged changes
critique --staged --web "Refactor auth middleware"

# Branch diff (three-dot: changes since diverging from base)
critique main...HEAD --web "Feature branch changes"
critique main...feature-branch --web "Compare branches"

# GitHub pull request URL, including outside a local git repo
critique https://github.com/remorses/sigillo/pull/19 --web "Sigillo PR #19"

# Last N commits
critique HEAD~3 --web "Recent changes"

# Specific commit
critique --commit HEAD --web "Latest commit"
critique --commit abc1234 --web "Fix race condition"

# Filter to specific files
critique --web "API changes" --filter "src/api.ts" --filter "src/utils.ts"

# JSON output for programmatic use (returns {url, id, files})
critique --web "Deploy changes" --json
```

Share the returned URL with the user so they can see the diff.
Private PRs use `GH_TOKEN`, `GITHUB_TOKEN`, or an existing `gh auth login` session.

## PDF

```bash
critique --pdf                              # working tree to PDF
critique --staged --pdf                     # staged changes
critique main...HEAD --pdf                   # branch diff
critique --commit HEAD --pdf                # single commit
critique --pdf output.pdf                   # custom filename
critique --pdf --pdf-page-size a4-portrait  # page size options
critique main...HEAD --pdf --open            # open in viewer
```

## Image

```bash
critique --image              # renders to /tmp as WebP
critique main...HEAD --image  # branch diff as images
```

## Selective hunk staging

When multiple agents work on the same repo, each agent should only commit its own changes. `critique hunks` lets you stage individual hunks instead of whole files — like a scriptable `git add -p`.

```bash
# List hunks with stable IDs
critique hunks list
critique hunks list --filter "src/**/*.ts"

# Stage specific hunks by ID
critique hunks add 'src/main.ts:@a1b2c3d4e5f6'
critique hunks add 'src/main.ts:@a1b2c3d4e5f6' 'src/utils.ts:@f6e5d4c3b2a1'
```

Hunk ID format: `file:@<hash>` or `file:@<hash>.1`. The hash is from added and removed lines, so unrelated edits above or below the hunk do not change the ID. Duplicate payloads in the same file get `.1`, `.2`. Old `file:@-oldStart,...` IDs are no longer accepted. `hunks list` still prints the `@@` header under each ID.

**Typical workflow:**

```bash
critique hunks list                          # see all unstaged hunks
critique hunks add 'file:@a1b2c3d4e5f6'     # stage only your hunks
git commit -m "your changes"                 # commit separately
```

## Raw patch access

Every `--web` upload also stores the raw unified diff. Append `.patch` to any critique URL to get it:

```bash
# View the raw patch
curl https://critique.work/v/<id>.patch

# Apply the patch to current repo
curl -s https://critique.work/v/<id>.patch | git apply

# Reverse the patch (undo the changes)
curl -s https://critique.work/v/<id>.patch | git apply --reverse
```

Useful when an agent shares a critique URL and you want to programmatically apply or revert those changes.

Password links (`--password`, IDs start with `p`) are end-to-end encrypted: the CLI encrypts before upload, so not even the critique.work operator can read them. Use `--password` for private code. Plain curl gets a 401 hint. Use the curl command critique printed after upload (also `curl` in `--json`), which sends the diff key in a cookie:

```bash
curl -b 'critique_key=<key>' https://critique.work/v/<id>.patch
```

## Notes

- Requires **Bun** — use `bunx critique` or global `critique`
- Lock files and diffs >6000 lines are auto-hidden
- `--web` URLs expire after 7 days (content-hashed, same diff = same URL)
