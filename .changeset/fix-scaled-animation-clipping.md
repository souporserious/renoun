---
'@renoun/screenshot': patch
---

Fixes CSS animations with transforms being clipped to their layout bounds instead of visual bounds. Now the offscreen canvas is sized to the element's visual rect, properly accommodating scaled content.
