---
'@renoun/screenshot': patch
---

Fixes backdrop-filter blur rendering:

- Scales `blur()` values correctly for rem/em units and high-DPI canvases
- Expands backdrop sampling area for smooth feathered edges
- Uses separate canvas for blur to avoid self-draw issues
- Composites with `source-over` instead of `destination-over`
- Optimizes blur with downscaling (0.125x for large blurs) before applying filter
- Replaces naive O(radius × pixels) box blur with O(pixels) sliding accumulator algorithm for drastically improved fallback performance
