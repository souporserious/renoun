---
'renoun': patch
---

Improves performance for simple glob patterns (e.g. `*.<extension>` and `**/*.<extension>`) by building a predicate filter instead of using Minimatch.
