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
