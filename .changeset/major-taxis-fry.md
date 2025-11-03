---
'renoun': patch
---

Fixes `RootProvider` config not being applied in dynamic applications. Now `globalThis` is exclusively used instead of `React.cache`.
