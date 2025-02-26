---
'renoun': minor
---

Adds a cache for `Directory#getEntries` and `JavaScriptFile#getFileExports` during production builds to help with performance since these methods can be called multiple times during a build.
