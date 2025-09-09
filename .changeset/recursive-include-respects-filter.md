---
'renoun': patch
---

Fixes recursive `Directory#getEntries` traversal not respecting the `include` filter when descending. Previously, child entries from excluded directories could leak into results, causing invalid slugs to be generated.
