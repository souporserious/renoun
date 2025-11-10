---
'renoun': patch
---

Stabilizes `workspace:` scheme resolution. `Directory` now stores absolute workspace‑anchored paths when resolving `workspace:` to avoid cwd coupling.
