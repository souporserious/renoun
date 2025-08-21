---
'renoun': patch
---

Fixes missing `moduleSpecifier` metadata in `JavaScriptFileExport#getType` when resolving a union type reference without a concrete `TypeReferenceNode`.
