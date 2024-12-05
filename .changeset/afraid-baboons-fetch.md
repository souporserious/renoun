---
'renoun': patch
---

Fixes an issue in the `<Directory>.getFile` method where the `entry` variable was not reset in each iteration of the while loop. This caused incorrect file resolutions when searching for nested files.
