---
'renoun': patch
---

Handles conditional extends operands in `JavaScriptModuleExport#getType` by emitting references when visible and inlining only when referenced symbols cannot be resolved.
