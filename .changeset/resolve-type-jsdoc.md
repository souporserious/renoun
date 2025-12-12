---
'renoun': patch
---

Fixes resolving JSDoc call signatures when inferred function types are weak. The `ModuleExport#getType` utility now prefers JSDoc type annotations over inferred types when the JSDoc signature provides more useful information.
