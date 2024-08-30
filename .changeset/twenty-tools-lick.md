---
'omnidoc': patch
---

Fixes `getRootDirectory` not accounting for non-monorepos and returns the first directory where a `package.json` file was found.
