---
'renoun': patch
---

Fixes an error in `ModuleExport#getType` when resolving `keyof`-based types whose origin is not a union.
