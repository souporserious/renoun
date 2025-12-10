---
'renoun': patch
---

Fixes resolving JSDoc call signatures when inferred function types are `any` and now unwraps nullable JSDoc annotations so `ModuleExport#getType` keeps the intended literal types.
