---
'renoun': patch
---

Fixes `File.getRelativePathToWorkspace` so that files constructed with a `directory` instance and a relative path correctly resolve to the directory's workspace-prefixed path without duplicating segments.


