---
'renoun': patch
---

Replaces regex-based path normalization in `GitHostFileSystem` with linear-time string trimming to avoid potential polynomial ReDoS and improve performance when handling paths with repeated slashes.
