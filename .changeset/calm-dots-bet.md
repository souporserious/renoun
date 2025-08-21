---
'renoun': patch
---

Fixes infinite recursion in `JavaScriptFileExport#getType` when resolving a union type that references itself.
