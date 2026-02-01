---
'renoun': patch
---

Fixes `InMemoryFileSystem.getFileExports` by lazily synchronizing source files to ts-morph before retrieving exports.
