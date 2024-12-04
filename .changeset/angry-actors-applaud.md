---
'renoun': patch
---

Fixes nested files being ordered before directory when using `<Directory>.getEntries`. Now the directory will be ordered first by default before its descendants.
