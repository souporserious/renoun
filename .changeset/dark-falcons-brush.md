---
'renoun': patch
---

Fixes `isOptional` for properties in `JavaScriptFileExport#getType` not considering symbol optionality as well as checking if the default value is explicitly `undefined`.
