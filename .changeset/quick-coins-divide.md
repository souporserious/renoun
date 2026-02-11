---
'renoun': patch
---

Fixes `Collection#getFile` type inference so schema-derived frontmatter types are preserved instead of widening to `unknown` or narrowing export names to only `'default'`.
