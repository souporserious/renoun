---
'renoun': minor
---

Adds feature parity to `GitHostFileSystem` with the new `LocalGitFileSystem` for export history analysis:

- Cross-file rename detection using body and signature hash matching
- Oscillation detection to collapse temporary Added/Removed changes within the same release
- Deprecation change tracking to record when exports become deprecated
