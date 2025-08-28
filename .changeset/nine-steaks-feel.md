---
'renoun': patch
---

Fixes `JavaScriptFileExport#getType` causing maximum call stack exceeded errors when resolving recursive array types (e.g. `type A = A[]`).
