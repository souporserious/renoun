---
'renoun': patch
---

Tightens cache invalidation across development, CI, and production-oriented analysis flows.

- Stops non-production RPC memoization for source text metadata and token requests so local edits cannot be masked by a stale websocket cache layer.
- Enables strict hermetic file-system cache defaults in CI and lets runtime analysis snapshots honor the shared environment default again.
