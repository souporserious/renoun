---
'@renoun/screenshot': patch
---

Implements missing CSS filter functions for the Safari polyfill:

- `sepia()` - Applies standard sepia tone matrix transformation
- `hue-rotate()` - Rotates hue using CSS filter spec color rotation matrix (supports deg, rad, turn, grad units)
- `saturate()` - Adjusts color saturation by interpolating between grayscale and original color
