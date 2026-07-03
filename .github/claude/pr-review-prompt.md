/code-review:code-review ${REPO}/pull/${PR_NUMBER}

Review the pull request above. This is a Wails desktop app: a Go backend
(`internal/`, `cmd/`) with a React + TypeScript frontend (`frontend/`).

Post concise, actionable feedback as inline review comments plus a short
summary comment. Only flag substantive issues — do not nitpick style that
`golangci-lint`, `eslint`, or `tsc` already enforce.

Focus on:
- Correctness and error handling in both the Go services and the React
  hooks/components, including edge cases and race conditions.
- Test coverage — the frontend Jest suite enforces a 90% global threshold and
  Go logic is expected to be tested; flag new exported Go functions or React
  hooks/components that ship without tests.
- React Query cache correctness: that mutations invalidate/refetch the right
  query keys so grids and the image viewer reflect new data after imports,
  deletes, and edits.
- Adherence to existing patterns and any conventions documented in CLAUDE.md.
- Security of changes touching file I/O, the import/backup paths, or the
  Wails IPC bindings.
