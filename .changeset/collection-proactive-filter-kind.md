---
'renoun': patch
---

Fixes `Collection#getEntries({ recursive: true })` when using a shallow glob. The `Collection` utility now proactively checks each child `Directory`'s filter kind via `getFilterPatternKind()` and disables recursion for directories with single‑level filter patterns.
