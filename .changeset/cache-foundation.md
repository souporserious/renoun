---
'renoun': minor
---

Introduces a new snapshot/session-based cache layer for `renoun` with optional SQLite persistence, improving performance for repeated codebase queries across file structure, export analysis, type resolution, and git metadata/history lookups. It also improves cache invalidation and fallback behavior so markdown/MDX-derived code blocks can reuse stable quick-info and history data more reliably.

### Breaking Changes

- Keeps the analysis and project client entrypoints internal by removing the public `renoun/analysis` and `renoun/project` subpath exports
- The `renoun` package now relies on React 19 client APIs when rendering quick info documentation, so React 18 and below are no longer supported.
