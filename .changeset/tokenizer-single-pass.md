---
'renoun': minor
---

Refactors the tokenizer used for syntax highlighting by using a single long‑lived worker that caches grammars and returns them once per file. This significantly improves build performance especially when using multiple themes.
