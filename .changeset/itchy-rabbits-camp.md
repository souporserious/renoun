---
'renoun': patch
---

Fixes a regression from when multiple themes were introduced that had removed token rendering optimizations. Now tokens across themes that are not a symbol and match the foreground color will not be wrapped in an element.
