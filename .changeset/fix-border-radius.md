---
'@renoun/screenshot': patch
---

Fixes border-radius percentage values (e.g., `border-radius: 50%`) not being calculated correctly. Previously, `50%` was parsed as `50` pixels instead of being calculated as a percentage of the element's dimensions, resulting in non-circular shapes for elements larger than 100px.
