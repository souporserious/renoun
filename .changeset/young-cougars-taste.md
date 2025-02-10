---
'renoun': minor
---

Updates a project's default compiler options to only be set when using `MemoryFileSystem`. This makes sure to respect the local `tsconfig.json` file without any implicit overrides when using `NodeFileSystem`.
