---
'renoun': patch
---

Explicitly sets the prettier `parser` option instead of relying on inference from `filepath` to avoid false-positive errors when parsing code blocks without a provided `filename`.
