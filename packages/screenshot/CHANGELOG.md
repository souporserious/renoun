# @renoun/screenshot

## 0.3.1

### Patch Changes

- f26f512: Avoids regex backtracking when trimming leading/trailing whitespace during text layout.
- eb0bbca: Removes fixture data from published package.

## 0.3.0

### Minor Changes

- f71c9f7: Adds text supersampling to keep text rendering crisp.

### Patch Changes

- e60ee2f: Ensures SVG rasterization and canvas text rendering honor font feature settings like tabular numbers and load webfonts from accessible stylesheets.
- f0835bc: Fixes input vertical baseline.

## 0.2.0

### Minor Changes

- 3ac6706: Adds support for configurable ignore selectors (defaults to `data-screenshot-ignore`) to skip elements during rendering.

### Patch Changes

- 8f1c164: Fixes `calc` expressions when resolving background-position offsets.
- 4d99456: Injects fonts when serializing SVG data to ensure text renders correctly.
- 9919123: Prevents SVG text from being rendered twice by skipping child traversal when the SVG is rasterized as a whole.
- 014da03: Fixes rendering for default-styled buttons.
- f284fde: Implements `drop-shadow` filter polyfill for unsupported browsers.
- 2965dae: Improves text rendering quality by using proper text metrics and handling white-space the same as the DOM.
- ce7157b: Fixes oversaturated backdrop filter.
- ba3d259: Fixes default user agent text-decoration underline styles.
- d679ee5: Fixes svg transforms being applied twice.

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
