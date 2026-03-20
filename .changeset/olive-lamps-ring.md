---
'renoun': patch
---

Fixes explicit remote ref invalidation for cached git repositories so branch updates refresh file reads, sync reads, and analysis caches against the latest fetched ref.
