---
'renoun': minor
---

Adds a cache to the `<ExportSource>.getType` method to prevent unnecessary processing of types since this is an expensive operation. Types will now only be resolved the first time they are requested and then cached for subsequent requests unless one of the file dependencies has changed.
