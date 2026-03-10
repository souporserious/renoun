---
'renoun': minor
---

Introduces a new snapshot/session-based cache layer for `renoun` with optional SQLite persistence, improving performance for repeated codebase queries across file structure, export analysis, type resolution, and git metadata/history lookups. It also improves cache invalidation and fallback behavior so markdown/MDX-derived code blocks can reuse stable quick-info and history data more reliably.

### Entry Points

- Adds `renoun/analysis` as the preferred analysis client entrypoint
- Keeps `renoun/project` as a compatibility alias for existing consumers
