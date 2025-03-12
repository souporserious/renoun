---
'renoun': minor
---

Adds back the `workingDirectory` prop to the `CodeBlock` component for targeting local files. When defined, this will be joined with the `path` prop to load a source file located within the file system instead of creating a virtual file which allows imports and types to be resolved correctly.
