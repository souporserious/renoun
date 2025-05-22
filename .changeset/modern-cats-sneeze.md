---
'renoun': minor
---

Adds analysis for mapped types to `JavaScriptExport#getType` by introducing a new `Mapped` kind. This will now capture mapped types instead of always expanding them fully which would result in large and repetitive types.
