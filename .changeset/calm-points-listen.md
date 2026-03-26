---
'renoun': patch
---

Improves git-backed build stability by preserving warmed file analysis caches
across workers and coordinating shared analysis sparse-checkout scopes during
concurrent builds.
