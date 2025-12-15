---
'renoun': minor
---

Adds `includeHiddenFiles` option to `Directory.getEntries()`. Hidden files and directories (names starting with `.`) are now excluded by default, preventing issues like `.gitkeep` files being captured as content entries.

