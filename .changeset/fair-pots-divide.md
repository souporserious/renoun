---
'renoun': patch
---

Fixes build regressions in Next.js apps by restoring persistent cache
root to `.next/cache/renoun`, aligning git-backed analysis caches with that same
root, and tightening `getFile()` prewarm inference so simple null guards do not
promote lightweight export lookups into expensive type-analysis bootstrap work.
