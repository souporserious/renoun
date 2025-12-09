---
'renoun': patch
---

Fixes resolving complex return types in `ModuleExport#getType` from infinitely recursing causing a maximum call stack error.
