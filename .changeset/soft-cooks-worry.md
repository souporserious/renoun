---
'renoun': major
---

Removes `getText()`/`getBinary()` methods in favor of `text()` / `arrayBuffer()` (and `bytes()` for `Uint8Array`).

- `File#getText()` → `File#text()`
- `File#getBinary()` → `File#bytes()` (or `File#arrayBuffer()`)
- `ModuleExport#getText()` → `ModuleExport#text()`

