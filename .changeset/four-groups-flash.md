---
'renoun': patch
---

Fixes `JavaScriptFileExport#getType` not resolving instantiated mapped types correctly. The resolver now considers if the mapped type has a string or number index signature defined.
