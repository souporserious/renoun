---
'renoun': patch
---

Fixes leaky context in `CodeBlock` by passing `path` and `baseDirectory` props directly to `Tokens`.
