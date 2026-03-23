---
'renoun': patch
---

Improves multi-worker performance and reliability for repository history and analysis.

- Deduplicates export history work across workers using persisted cache
- Fixes React streaming/Suspense issues for `History` loading
- Reduces redundant git checks with caching and smarter probes
- Expands CLI prewarm discovery to include export history
- Fixes `Reference` edge cases and crashes
- Optimizes directory snapshot and export type resolution
