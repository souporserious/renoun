---
'@renoun/screenshot': patch
---

Fixes mix-blend-mode rendering for elements with CSS transforms that include translations (e.g., `translateX(-50%)`). The `getLayoutRect` function was using a center-based approximation that incorrectly calculated the pre-transform position for translated elements, causing blend modes to be applied at wrong positions.
