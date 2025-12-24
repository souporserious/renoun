---
'@renoun/screenshot': patch
---

Fixes 3D transform rendering when the page is scrolled:

- `computeBrowserCorners` was using viewport-relative coordinates from `getBoxQuads()` without converting to document coordinates
- The calibration calculation was double-counting scroll offset (adding scroll to `visualRect` which already includes scroll)
