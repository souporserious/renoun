# @renoun/screenshot

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
