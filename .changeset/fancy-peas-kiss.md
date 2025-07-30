---
'renoun': patch
---

Fixes `MethodSignature` type resolution in `JavaScriptFileExport#getType`. This was previously being treated as a `PropertySignature` which errored when multiple signatures existed.
