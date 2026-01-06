# @renoun/screenshot

## 0.1.1

### Patch Changes

- 0c8a6f6: Expands capture region to include box/text shadows when overflow isn’t clipped.
- 14f52c2: Fixes 3D transform rendering when the page is scrolled:
  - `computeBrowserCorners` was using viewport-relative coordinates from `getBoxQuads()` without converting to document coordinates
  - The calibration calculation was double-counting scroll offset (adding scroll to `visualRect` which already includes scroll)

- f9f5ceb: Fixes unwanted borders appearing around button elements in screenshots. The `renderFormControl` function now respects `border: none` on buttons instead of forcing a minimum 1px border. Also improves `drawOutline` to skip rendering for `outline-style: auto`, which is the browser default for focus rings.
- bc1cf8a: Fixes backdrop-filter blur rendering:
  - Scales `blur()` values correctly for rem/em units and high-DPI canvases
  - Expands backdrop sampling area for smooth feathered edges
  - Uses separate canvas for blur to avoid self-draw issues
  - Composites with `source-over` instead of `destination-over`
  - Optimizes blur with downscaling (0.125x for large blurs) before applying filter
  - Replaces naive O(radius × pixels) box blur with O(pixels) sliding accumulator algorithm for drastically improved fallback performance

- d025616: Fixes border-radius percentage values (e.g., `border-radius: 50%`) not being calculated correctly. Previously, `50%` was parsed as `50` pixels instead of being calculated as a percentage of the element's dimensions, resulting in non-circular shapes for elements larger than 100px.
- 42c4dd1: Avoids double-rendered button labels by skipping the form-control renderer for `<button>` elements and letting the normal DOM/text pipeline paint them.
- cd10d85: Fixes CSS filter rendering in Firefox by forcing the use of the filter polyfill. Firefox's native `context.filter` implementation has bugs when used with `display-p3` colorSpace on Canvas2D, causing filters like `sepia()` to render with incorrect colors.
- 1cfea15: Adds support for `background-size` and `background-position` on gradient backgrounds:.
- fda47df: Fixes mix-blend-mode rendering for elements with CSS transforms that include translations (e.g., `translateX(-50%)`). The `getLayoutRect` function was using a center-based approximation that incorrectly calculated the pre-transform position for translated elements, causing blend modes to be applied at wrong positions.
- 673f0e2: Fixes input/textarea placeholder text using the computed `::placeholder` color.
- b9dc917: Implements missing CSS filter functions for the Safari polyfill:
  - `sepia()` - Applies standard sepia tone matrix transformation
  - `hue-rotate()` - Rotates hue using CSS filter spec color rotation matrix (supports deg, rad, turn, grad units)
  - `saturate()` - Adjusts color saturation by interpolating between grayscale and original color

- bfc85ef: Fixes CSS animations with transforms being clipped to their layout bounds instead of visual bounds. Now the offscreen canvas is sized to the element's visual rect, properly accommodating scaled content.
- 10f9d61: Fixes SVG alignment by stripping layout styles from serialized SVGs while preserving paint styles (color/fill/stroke).
- 0b5112f: Fixes text bounds when using a larger font-weight.

## 0.1.0

### Minor Changes

- 0a5564e: Adds a new `@renoun/screenshot` package for taking screenshots of client-side DOM elements:

  ```ts
  import { screenshot } from '@renoun/screenshot'

  // Render to canvas
  const canvas = await screenshot(element, { scale: 2 })

  // Render and encode to Blob
  const blob = await screenshot.blob(element, {
    format: 'jpeg',
    quality: 0.92,
  })

  // Render and create an object URL (for <img src>)
  const url = await screenshot.url(element, { format: 'png' })
  // Revoke when done
  URL.revokeObjectURL(url)
  ```
