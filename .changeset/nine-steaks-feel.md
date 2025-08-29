---
'renoun': patch
---

Fixes `JavaScriptModuleExport#getType` causing maximum call stack exceeded errors when resolving recursive array types (e.g. `type A = A[]`).
