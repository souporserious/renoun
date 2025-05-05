---
'renoun': minor
---

`JavaScriptFile#getExports` now sorts exports by their position. Previously, the order was determined by the TypeScript compiler which will hoist function declarations to the top of the file. This change ensures that the order of exports is consistent with the source file.
