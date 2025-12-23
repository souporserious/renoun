---
'renoun': patch
---

Fixes a bug in `InMemoryFileSystem.readDirectorySync` where sibling files with a shared prefix were incorrectly included when reading a subdirectory.
