---
'critique': patch
---

Fix syntax highlighting for partial diffs that start inside inline snapshots, template literals, or block comments.

Delimiter repair now treats missing openers and missing closers symmetrically, so later lines in the same hunk keep their TypeScript highlighting instead of being parsed as an unterminated string or comment.
