---
'renoun': patch
---

Fixes explicit-ref analysis for cached git repositories so export and type lookups use the selected ref, and keeps Next.js app caches under `.next/renoun` instead of creating extra `.renoun/cache` roots.
