# @renoun/screenshot

A client-side library for rendering HTML elements to canvas. Captures DOM elements with full CSS support including gradients, transforms, shadows, filters, and more.

## Installation

```bash
npm install @renoun/screenshot
```

## Usage

### Convenience Methods

The simplest way to capture screenshots:

```ts
import { screenshot } from '@renoun/screenshot'

// Render to canvas
const canvas = await screenshot.canvas(element, { scale: 2 })

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

### Handle Pattern

For advanced use cases where you want to render once and encode multiple ways:

```ts
import { screenshot } from '@renoun/screenshot'

const shot = screenshot(element, {
  includeFixed: 'intersecting',
  scale: window.devicePixelRatio,
})

// Reuse the same render for multiple encodings
const canvas = await shot.canvas()
const pngBlob = await shot.blob({ format: 'png' })
const webpUrl = await shot.url({ format: 'webp', quality: 0.9 })

// Direct await also returns the canvas
const canvas2 = await shot
```

### CSS Selector Support

You can pass a CSS selector instead of an element:

```ts
const blob = await screenshot.blob('#my-element', { format: 'png' })
```

### UI Preview Pattern

When updating previews in a UI, remember to revoke old URLs:

```ts
let lastUrl: string | null = null

async function updatePreview() {
  if (lastUrl) URL.revokeObjectURL(lastUrl)
  lastUrl = await screenshot.url(element, { format: 'png' })
  img.src = lastUrl
}
```

## API

### `screenshot(target, options?)`

Creates a `ScreenshotTask` that renders the element once and provides methods to access the result in different formats.

**Returns:** `ScreenshotTask` - A promise-like object with additional methods.

### `screenshot.canvas(target, options?)`

One-shot method to render directly to a canvas.

**Returns:** `Promise<HTMLCanvasElement>`

### `screenshot.blob(target, options?)`

One-shot method to render and encode to a Blob.

**Returns:** `Promise<Blob>`

### `screenshot.url(target, options?)`

One-shot method to render and create an object URL.

**Returns:** `Promise<string>` - Remember to call `URL.revokeObjectURL()` when done.

## Types

```typescript
type ImageFormat = 'png' | 'jpeg' | 'webp'

interface RenderOptions {
  /** Canvas background color. Set to `null` for transparent. */
  backgroundColor?: string | null

  /** Optional existing canvas to render into. */
  canvas?: HTMLCanvasElement

  /** Rendering scale factor. Defaults to `window.devicePixelRatio`. */
  scale?: number

  /** Crop origin X (CSS pixels) relative to the element. */
  x?: number

  /** Crop origin Y (CSS pixels) relative to the element. */
  y?: number

  /** Output width in CSS pixels. Defaults to element width. */
  width?: number

  /** Output height in CSS pixels. Defaults to element height. */
  height?: number

  /**
   * Controls how `position: fixed` elements are handled.
   * - `none` – ignore fixed elements outside the target.
   * - `intersecting` – include fixed elements that intersect the capture rect.
   * - `all` – include all fixed elements in the viewport.
   */
  includeFixed?: 'none' | 'intersecting' | 'all'
}

interface EncodeOptions {
  /** Image format. Defaults to 'png'. */
  format?: ImageFormat

  /** Quality for jpeg/webp (0-1). Defaults to 0.92. */
  quality?: number
}

type ScreenshotOptions = RenderOptions & EncodeOptions

interface ScreenshotTask extends Promise<HTMLCanvasElement> {
  canvas(): Promise<HTMLCanvasElement>
  blob(options?: EncodeOptions): Promise<Blob>
  url(options?: EncodeOptions): Promise<string>
}
```

## Features

- CSS gradients (linear, radial, conic)
- Box shadows and text shadows
- Border radius and borders
- CSS transforms including 3D with perspective
- Backdrop filters
- Clip paths
- CSS masks
- Text decorations
- Form controls
- SVG elements
- Fixed position elements
- High-DPI rendering

## License

[MIT](/LICENSE.md) © [souporserious](https://souporserious.com/)
