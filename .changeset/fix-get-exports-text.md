---
'renoun': patch
---

Fixes `getFileExportsText` to preserve inline annotation comments when including dependencies. Previously, we stripped all JSDoc blocks with a global regex which inadvertently removed valid inline comments.
