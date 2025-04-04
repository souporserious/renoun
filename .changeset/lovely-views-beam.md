---
'renoun': patch
---

Fixes a bug in `Directory#getFile` where a file name modifier (e.g. `examples` in `Button.examples.tsx`) for the provided path was not being considered when checking if a file exists.
