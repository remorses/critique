---
'critique': patch
---

Fix diff parsing failure when an external diff driver is configured.

When users have `diff.external` set in gitconfig (e.g. difftastic) or the
`GIT_EXTERNAL_DIFF` environment variable, `git diff` delegates to the external
program and emits non-standard output. Critique's parser finds nothing and shows
"unknown +0-0".

All internal `git diff` and `git show` invocations now include `--no-ext-diff`,
which forces git to produce standard unified diff output regardless of user
configuration. No behavior change for users without an external diff driver.

Fixes #45
