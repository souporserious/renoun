---
'renoun': patch
---

Fixes `getFileExportsText` to use the correct node position across subsequent calls by removing AST node mutations which avoids the position from being changed.
