---
'@renoun/screenshot': patch
---

Fixes CSS filter rendering in Firefox by forcing the use of the filter polyfill. Firefox's native `context.filter` implementation has bugs when used with `display-p3` colorSpace on Canvas2D, causing filters like `sepia()` to render with incorrect colors.
