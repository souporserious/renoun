---
'renoun': patch
---

Fixes clone-backed explicit remote refs so warm export-history reads avoid duplicate remote freshness checks and concurrent identical history requests share in-flight work.
