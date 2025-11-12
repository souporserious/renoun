---
'renoun': patch
---

Hardens Bitbucket author parsing by repeatedly stripping angle-bracket tags to
avoid incomplete multi-character sanitization in `GitHostFileSystem`.
