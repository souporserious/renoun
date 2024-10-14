---
'renoun': patch
---

Fixes issue with trying to format dynamic imports added to collections from CLI causing issues with linters. Now, formatting will only occur if the workspace has access to `prettier`.
