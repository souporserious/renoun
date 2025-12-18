import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { screenshot } from './index.js'

// =============================================================================
// Test Utilities
// =============================================================================

interface RGBA {
  r: number
  g: number
  b: number
  a: number
}

/** Get pixel color at a specific position from canvas */
function getPixel(canvas: HTMLCanvasElement, x: number, y: number): RGBA {
  const ctx = canvas.getContext('2d')!
  const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data
  return { r, g, b, a }
}

/** Sample multiple pixels and return the average color */
function sampleArea(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  size: number
): RGBA {
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(x, y, size, size)
  const data = imageData.data
  let r = 0,
    g = 0,
    b = 0,
    a = 0
  const pixelCount = size * size

  for (let i = 0; i < data.length; i += 4) {
    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
    a += data[i + 3]
  }

  return {
    r: Math.round(r / pixelCount),
    g: Math.round(g / pixelCount),
    b: Math.round(b / pixelCount),
    a: Math.round(a / pixelCount),
  }
}

/** Check if a color matches expected values within tolerance */
function colorsMatch(
  actual: RGBA,
  expected: RGBA,
  tolerance: number = 5
): boolean {
  return (
    Math.abs(actual.r - expected.r) <= tolerance &&
    Math.abs(actual.g - expected.g) <= tolerance &&
    Math.abs(actual.b - expected.b) <= tolerance &&
    Math.abs(actual.a - expected.a) <= tolerance
  )
}

/** Custom matcher for color comparison */
function expectColor(actual: RGBA, expected: RGBA, tolerance: number = 5) {
  const matches = colorsMatch(actual, expected, tolerance)
  if (!matches) {
    throw new Error(
      `Color mismatch:\n` +
        `  Expected: rgba(${expected.r}, ${expected.g}, ${expected.b}, ${expected.a})\n` +
        `  Received: rgba(${actual.r}, ${actual.g}, ${actual.b}, ${actual.a})\n` +
        `  Tolerance: ${tolerance}`
    )
  }
}

/** Check if entire canvas region has a solid color */
function isRegionSolidColor(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  color: RGBA,
  tolerance: number = 5
): boolean {
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(x, y, width, height)
  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    const pixel = { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] }
    if (!colorsMatch(pixel, color, tolerance)) {
      return false
    }
  }
  return true
}

/** Create a test element with specified styles */
function createElement(
  styles: Partial<CSSStyleDeclaration>,
  content?: string
): HTMLDivElement {
  const element = document.createElement('div')
  Object.assign(element.style, styles)
  if (content) element.textContent = content
  return element
}

// =============================================================================
// Tests
// =============================================================================

describe('screenshot', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    container.id = 'test-container'
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  // ===========================================================================
  // API Tests
  // ===========================================================================

  describe('API', () => {
    describe('screenshot.canvas()', () => {
      it('returns an HTMLCanvasElement', async () => {
        const element = createElement({
          width: '100px',
          height: '100px',
          backgroundColor: 'red',
        })
        container.appendChild(element)

        const canvas = await screenshot.canvas(element)

        expect(canvas).toBeInstanceOf(HTMLCanvasElement)
        expect(canvas.width).toBeGreaterThan(0)
        expect(canvas.height).toBeGreaterThan(0)
      })

      it('respects scale option', async () => {
        const element = createElement({
          width: '100px',
          height: '100px',
          backgroundColor: 'blue',
        })
        container.appendChild(element)

        const canvas = await screenshot.canvas(element, { scale: 2 })

        expect(canvas.width).toBe(200)
        expect(canvas.height).toBe(200)
      })

      it('accepts CSS selector as target', async () => {
        const element = createElement({
          width: '50px',
          height: '50px',
          backgroundColor: 'green',
        })
        element.id = 'selector-test'
        container.appendChild(element)

        const canvas = await screenshot.canvas('#selector-test', { scale: 1 })

        expect(canvas.width).toBe(50)
        expect(canvas.height).toBe(50)
      })
    })

    describe('screenshot.blob()', () => {
      it('returns PNG blob by default', async () => {
        const element = createElement({
          width: '50px',
          height: '50px',
          backgroundColor: 'purple',
        })
        container.appendChild(element)

        const blob = await screenshot.blob(element, { scale: 1 })

        expect(blob).toBeInstanceOf(Blob)
        expect(blob.type).toBe('image/png')
      })

      it('returns JPEG blob when specified', async () => {
        const element = createElement({
          width: '50px',
          height: '50px',
          backgroundColor: 'orange',
        })
        container.appendChild(element)

        const blob = await screenshot.blob(element, {
          scale: 1,
          format: 'jpeg',
        })

        expect(blob.type).toBe('image/jpeg')
      })

      it('returns WebP blob when specified', async () => {
        const element = createElement({
          width: '50px',
          height: '50px',
          backgroundColor: 'cyan',
        })
        container.appendChild(element)

        const blob = await screenshot.blob(element, {
          scale: 1,
          format: 'webp',
        })

        expect(blob.type).toBe('image/webp')
      })
    })

    describe('screenshot.url()', () => {
      it('returns a blob URL', async () => {
        const element = createElement({
          width: '50px',
          height: '50px',
          backgroundColor: 'yellow',
        })
        container.appendChild(element)

        const url = await screenshot.url(element, { scale: 1 })

        expect(typeof url).toBe('string')
        expect(url).toMatch(/^blob:/)

        URL.revokeObjectURL(url)
      })
    })

    describe('ScreenshotTask pattern', () => {
      it('can be awaited directly for canvas', async () => {
        const element = createElement({
          width: '50px',
          height: '50px',
          backgroundColor: 'teal',
        })
        container.appendChild(element)

        const task = screenshot(element, { scale: 1 })
        const canvas = await task

        expect(canvas).toBeInstanceOf(HTMLCanvasElement)
      })

      it('reuses render for multiple encodings', async () => {
        const element = createElement({
          width: '50px',
          height: '50px',
          backgroundColor: 'coral',
        })
        container.appendChild(element)

        const task = screenshot(element, { scale: 1 })

        const canvas = await task.canvas()
        const pngBlob = await task.blob({ format: 'png' })
        const jpegBlob = await task.blob({ format: 'jpeg' })

        expect(canvas).toBeInstanceOf(HTMLCanvasElement)
        expect(pngBlob.type).toBe('image/png')
        expect(jpegBlob.type).toBe('image/jpeg')
      })
    })
  })

  // ===========================================================================
  // Visual Accuracy Tests - Solid Colors
  // ===========================================================================

  describe('visual accuracy: solid colors', () => {
    it('renders solid red correctly', async () => {
      const element = createElement({
        width: '50px',
        height: '50px',
        backgroundColor: 'rgb(255, 0, 0)',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 1 })

      // Sample center of the element
      const color = sampleArea(canvas, 20, 20, 10)
      expectColor(color, { r: 255, g: 0, b: 0, a: 255 })
    })

    it('renders solid green correctly', async () => {
      const element = createElement({
        width: '50px',
        height: '50px',
        backgroundColor: 'rgb(0, 128, 0)',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 1 })

      const color = sampleArea(canvas, 20, 20, 10)
      expectColor(color, { r: 0, g: 128, b: 0, a: 255 })
    })

    it('renders solid blue correctly', async () => {
      const element = createElement({
        width: '50px',
        height: '50px',
        backgroundColor: 'rgb(0, 0, 255)',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 1 })

      const color = sampleArea(canvas, 20, 20, 10)
      expectColor(color, { r: 0, g: 0, b: 255, a: 255 })
    })

    it('renders white correctly', async () => {
      const element = createElement({
        width: '50px',
        height: '50px',
        backgroundColor: 'rgb(255, 255, 255)',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 1 })

      const color = sampleArea(canvas, 20, 20, 10)
      expectColor(color, { r: 255, g: 255, b: 255, a: 255 })
    })

    it('renders black correctly', async () => {
      const element = createElement({
        width: '50px',
        height: '50px',
        backgroundColor: 'rgb(0, 0, 0)',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 1 })

      const color = sampleArea(canvas, 20, 20, 10)
      expectColor(color, { r: 0, g: 0, b: 0, a: 255 })
    })

    it('renders hex colors correctly', async () => {
      const element = createElement({
        width: '50px',
        height: '50px',
        backgroundColor: '#ff6600',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 1 })

      const color = sampleArea(canvas, 20, 20, 10)
      expectColor(color, { r: 255, g: 102, b: 0, a: 255 })
    })

    it('renders transparent background correctly', async () => {
      const element = createElement({
        width: '50px',
        height: '50px',
        backgroundColor: 'transparent',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, {
        scale: 1,
        backgroundColor: null,
      })

      const color = getPixel(canvas, 25, 25)
      expect(color.a).toBe(0) // Fully transparent
    })

    it('renders semi-transparent colors correctly', async () => {
      const element = createElement({
        width: '50px',
        height: '50px',
        backgroundColor: 'rgba(255, 0, 0, 0.5)',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, {
        scale: 1,
        backgroundColor: null,
      })

      const color = sampleArea(canvas, 20, 20, 10)
      expectColor(color, { r: 255, g: 0, b: 0, a: 128 }, 10)
    })
  })

  // ===========================================================================
  // Visual Accuracy Tests - Gradients
  // ===========================================================================

  describe('visual accuracy: gradients', () => {
    it('renders horizontal linear gradient', async () => {
      const element = createElement({
        width: '100px',
        height: '50px',
        background: 'linear-gradient(to right, rgb(255, 0, 0), rgb(0, 0, 255))',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 1 })

      // Left side should be red
      const leftColor = sampleArea(canvas, 5, 20, 5)
      expectColor(leftColor, { r: 255, g: 0, b: 0, a: 255 }, 20)

      // Right side should be blue
      const rightColor = sampleArea(canvas, 90, 20, 5)
      expectColor(rightColor, { r: 0, g: 0, b: 255, a: 255 }, 20)

      // Middle should be purple-ish (mixed)
      const middleColor = sampleArea(canvas, 45, 20, 5)
      expect(middleColor.r).toBeGreaterThan(100)
      expect(middleColor.b).toBeGreaterThan(100)
    })

    it('renders vertical linear gradient', async () => {
      const element = createElement({
        width: '50px',
        height: '100px',
        background:
          'linear-gradient(to bottom, rgb(0, 255, 0), rgb(255, 255, 0))',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 1 })

      // Top should be green
      const topColor = sampleArea(canvas, 20, 5, 5)
      expectColor(topColor, { r: 0, g: 255, b: 0, a: 255 }, 20)

      // Bottom should be yellow
      const bottomColor = sampleArea(canvas, 20, 90, 5)
      expectColor(bottomColor, { r: 255, g: 255, b: 0, a: 255 }, 20)
    })

    it('renders radial gradient', async () => {
      const element = createElement({
        width: '100px',
        height: '100px',
        background:
          'radial-gradient(circle at center, rgb(255, 255, 255), rgb(0, 0, 0))',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 1 })

      // Center should be white-ish
      const centerColor = sampleArea(canvas, 45, 45, 5)
      expect(centerColor.r).toBeGreaterThan(200)
      expect(centerColor.g).toBeGreaterThan(200)
      expect(centerColor.b).toBeGreaterThan(200)

      // Corner should be dark
      const cornerColor = sampleArea(canvas, 5, 5, 5)
      expect(cornerColor.r).toBeLessThan(100)
      expect(cornerColor.g).toBeLessThan(100)
      expect(cornerColor.b).toBeLessThan(100)
    })
  })

  // ===========================================================================
  // Visual Accuracy Tests - Borders
  // ===========================================================================

  describe('visual accuracy: borders', () => {
    it('renders solid border correctly', async () => {
      const element = createElement({
        width: '50px',
        height: '50px',
        boxSizing: 'border-box',
        backgroundColor: 'white',
        border: '5px solid rgb(255, 0, 0)',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 1 })

      // Border area (top edge)
      const borderColor = sampleArea(canvas, 20, 2, 3)
      expectColor(borderColor, { r: 255, g: 0, b: 0, a: 255 }, 10)

      // Inner area
      const innerColor = sampleArea(canvas, 20, 20, 5)
      expectColor(innerColor, { r: 255, g: 255, b: 255, a: 255 }, 10)
    })

    it('renders different border colors per side', async () => {
      const element = createElement({
        width: '60px',
        height: '60px',
        boxSizing: 'border-box',
        backgroundColor: 'white',
        borderTop: '10px solid rgb(255, 0, 0)',
        borderRight: '10px solid rgb(0, 255, 0)',
        borderBottom: '10px solid rgb(0, 0, 255)',
        borderLeft: '10px solid rgb(255, 255, 0)',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 1 })

      // Top border - red
      const topBorder = sampleArea(canvas, 30, 3, 3)
      expectColor(topBorder, { r: 255, g: 0, b: 0, a: 255 }, 15)

      // Right border - green
      const rightBorder = sampleArea(canvas, 55, 30, 3)
      expectColor(rightBorder, { r: 0, g: 255, b: 0, a: 255 }, 15)

      // Bottom border - blue
      const bottomBorder = sampleArea(canvas, 30, 55, 3)
      expectColor(bottomBorder, { r: 0, g: 0, b: 255, a: 255 }, 15)

      // Left border - yellow
      const leftBorder = sampleArea(canvas, 3, 30, 3)
      expectColor(leftBorder, { r: 255, g: 255, b: 0, a: 255 }, 15)
    })
  })

  // ===========================================================================
  // Visual Accuracy Tests - Border Radius
  // ===========================================================================

  describe('visual accuracy: border radius', () => {
    it('renders rounded corners (transparent corners)', async () => {
      const element = createElement({
        width: '50px',
        height: '50px',
        backgroundColor: 'rgb(255, 0, 0)',
        borderRadius: '25px', // Full circle
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, {
        scale: 1,
        backgroundColor: null,
      })

      // Center should be red
      const centerColor = sampleArea(canvas, 20, 20, 5)
      expectColor(centerColor, { r: 255, g: 0, b: 0, a: 255 }, 10)

      // Corner should be transparent (due to border-radius)
      const cornerColor = getPixel(canvas, 2, 2)
      expect(cornerColor.a).toBeLessThan(50) // Should be mostly transparent
    })

    it('renders partially rounded corners', async () => {
      const element = createElement({
        width: '50px',
        height: '50px',
        backgroundColor: 'rgb(0, 0, 255)',
        borderRadius: '10px',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, {
        scale: 1,
        backgroundColor: null,
      })

      // Far corner should be transparent
      const farCorner = getPixel(canvas, 0, 0)
      expect(farCorner.a).toBe(0)

      // Inside the curve should be blue
      const insideCurve = getPixel(canvas, 10, 10)
      expectColor(insideCurve, { r: 0, g: 0, b: 255, a: 255 }, 10)
    })
  })

  // ===========================================================================
  // Visual Accuracy Tests - Nested Elements
  // ===========================================================================

  describe('visual accuracy: nested elements', () => {
    it('renders child element on top of parent', async () => {
      const outer = createElement({
        width: '100px',
        height: '100px',
        boxSizing: 'border-box',
        backgroundColor: 'rgb(255, 0, 0)',
        padding: '25px',
      })

      const inner = createElement({
        width: '50px',
        height: '50px',
        backgroundColor: 'rgb(0, 0, 255)',
      })

      outer.appendChild(inner)
      container.appendChild(outer)

      const canvas = await screenshot.canvas(outer, { scale: 1 })

      // Outer area (padding region) should be red
      const outerColor = sampleArea(canvas, 10, 10, 5)
      expectColor(outerColor, { r: 255, g: 0, b: 0, a: 255 }, 10)

      // Inner element should be blue
      const innerColor = sampleArea(canvas, 50, 50, 5)
      expectColor(innerColor, { r: 0, g: 0, b: 255, a: 255 }, 10)
    })

    it('renders multiple children correctly', async () => {
      const parent = createElement({
        width: '100px',
        height: '50px',
        backgroundColor: 'rgb(255, 255, 255)',
        display: 'flex',
      })

      const child1 = createElement({
        width: '50px',
        height: '50px',
        backgroundColor: 'rgb(255, 0, 0)',
      })

      const child2 = createElement({
        width: '50px',
        height: '50px',
        backgroundColor: 'rgb(0, 0, 255)',
      })

      parent.appendChild(child1)
      parent.appendChild(child2)
      container.appendChild(parent)

      const canvas = await screenshot.canvas(parent, { scale: 1 })

      // Left half should be red
      const leftColor = sampleArea(canvas, 20, 20, 5)
      expectColor(leftColor, { r: 255, g: 0, b: 0, a: 255 }, 10)

      // Right half should be blue
      const rightColor = sampleArea(canvas, 70, 20, 5)
      expectColor(rightColor, { r: 0, g: 0, b: 255, a: 255 }, 10)
    })

    it('respects z-index stacking', async () => {
      const parent = createElement({
        width: '100px',
        height: '100px',
        position: 'relative',
        backgroundColor: 'rgb(255, 255, 255)',
      })

      const bottom = createElement({
        width: '60px',
        height: '60px',
        position: 'absolute',
        top: '20px',
        left: '20px',
        backgroundColor: 'rgb(255, 0, 0)',
        zIndex: '1',
      })

      const top = createElement({
        width: '40px',
        height: '40px',
        position: 'absolute',
        top: '30px',
        left: '30px',
        backgroundColor: 'rgb(0, 0, 255)',
        zIndex: '2',
      })

      parent.appendChild(bottom)
      parent.appendChild(top)
      container.appendChild(parent)

      const canvas = await screenshot.canvas(parent, { scale: 1 })

      // Center should be blue (top element)
      const centerColor = sampleArea(canvas, 45, 45, 5)
      expectColor(centerColor, { r: 0, g: 0, b: 255, a: 255 }, 10)

      // Corner of bottom element (visible around top) should be red
      const bottomVisible = sampleArea(canvas, 22, 22, 3)
      expectColor(bottomVisible, { r: 255, g: 0, b: 0, a: 255 }, 10)
    })
  })

  // ===========================================================================
  // Visual Accuracy Tests - Transforms
  // ===========================================================================

  describe('visual accuracy: transforms', () => {
    it('renders scaled element', async () => {
      const wrapper = createElement({
        width: '100px',
        height: '100px',
        backgroundColor: 'rgb(255, 255, 255)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      })

      const scaled = createElement({
        width: '20px',
        height: '20px',
        backgroundColor: 'rgb(255, 0, 0)',
        transform: 'scale(2)',
      })

      wrapper.appendChild(scaled)
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 1 })

      // Center should be red (scaled element)
      const centerColor = sampleArea(canvas, 45, 45, 5)
      expectColor(centerColor, { r: 255, g: 0, b: 0, a: 255 }, 10)
    })

    it('renders rotated element', async () => {
      const wrapper = createElement({
        width: '100px',
        height: '100px',
        backgroundColor: 'rgb(255, 255, 255)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      })

      const rotated = createElement({
        width: '40px',
        height: '40px',
        backgroundColor: 'rgb(0, 255, 0)',
        transform: 'rotate(45deg)',
      })

      wrapper.appendChild(rotated)
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 1 })

      // Center should be green
      const centerColor = sampleArea(canvas, 45, 45, 5)
      expectColor(centerColor, { r: 0, g: 255, b: 0, a: 255 }, 10)
    })
  })

  // ===========================================================================
  // Visual Accuracy Tests - Box Shadow
  // ===========================================================================

  describe('visual accuracy: box shadow', () => {
    it('renders element with box shadow without errors', async () => {
      const element = createElement({
        width: '80px',
        height: '80px',
        backgroundColor: 'rgb(255, 255, 255)',
        boxShadow: '5px 5px 10px rgba(0, 0, 0, 0.5)',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 1 })

      // Verify element renders
      expect(canvas).toBeInstanceOf(HTMLCanvasElement)
      expect(canvas.width).toBeGreaterThan(0)
      expect(canvas.height).toBeGreaterThan(0)

      // Element should still have its background color
      const centerColor = sampleArea(canvas, 40, 40, 5)
      expectColor(centerColor, { r: 255, g: 255, b: 255, a: 255 }, 10)
    })

    it('renders inset box shadow', async () => {
      const element = createElement({
        width: '80px',
        height: '80px',
        backgroundColor: 'rgb(255, 255, 255)',
        boxShadow: 'inset 5px 5px 10px rgba(0, 0, 0, 0.5)',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 1 })

      // Verify element renders
      expect(canvas).toBeInstanceOf(HTMLCanvasElement)

      // Center should still be visible (inset shadow affects edges)
      const centerColor = sampleArea(canvas, 40, 40, 5)
      expect(centerColor.a).toBe(255) // Fully opaque
    })
  })

  // ===========================================================================
  // Cropping and Dimensions Tests
  // ===========================================================================

  describe('cropping and dimensions', () => {
    it('crops to specified width and height', async () => {
      const element = createElement({
        width: '100px',
        height: '100px',
      })
      // Create a gradient so we can verify what was cropped
      element.style.background =
        'linear-gradient(to right, rgb(255, 0, 0), rgb(0, 0, 255))'
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, {
        scale: 1,
        width: 50,
        height: 50,
      })

      expect(canvas.width).toBe(50)
      expect(canvas.height).toBe(50)

      // Should show left portion (red-ish)
      const color = sampleArea(canvas, 20, 20, 5)
      expect(color.r).toBeGreaterThan(color.b)
    })

    it('crops with x/y offset', async () => {
      const element = createElement({
        width: '100px',
        height: '100px',
      })
      element.style.background =
        'linear-gradient(to right, rgb(255, 0, 0), rgb(0, 0, 255))'
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, {
        scale: 1,
        x: 50,
        y: 0,
        width: 50,
        height: 100,
      })

      expect(canvas.width).toBe(50)
      expect(canvas.height).toBe(100)

      // Should show right portion (blue-ish)
      const color = sampleArea(canvas, 30, 50, 5)
      expect(color.b).toBeGreaterThan(color.r)
    })
  })

  // ===========================================================================
  // Scale Tests
  // ===========================================================================

  describe('scale accuracy', () => {
    it('maintains color accuracy at 2x scale', async () => {
      const element = createElement({
        width: '50px',
        height: '50px',
        backgroundColor: 'rgb(128, 64, 192)',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 2 })

      expect(canvas.width).toBe(100)
      expect(canvas.height).toBe(100)

      const color = sampleArea(canvas, 40, 40, 10)
      expectColor(color, { r: 128, g: 64, b: 192, a: 255 }, 5)
    })

    it('maintains gradient accuracy at higher scale', async () => {
      const element = createElement({
        width: '50px',
        height: '50px',
      })
      element.style.background =
        'linear-gradient(to right, rgb(255, 0, 0), rgb(0, 0, 255))'
      container.appendChild(element)

      const canvas1x = await screenshot.canvas(element, { scale: 1 })
      const canvas2x = await screenshot.canvas(element, { scale: 2 })

      // Sample equivalent positions
      const color1x = sampleArea(canvas1x, 20, 20, 5)
      const color2x = sampleArea(canvas2x, 40, 40, 5)

      // Colors should be similar
      expect(Math.abs(color1x.r - color2x.r)).toBeLessThan(20)
      expect(Math.abs(color1x.b - color2x.b)).toBeLessThan(20)
    })
  })

  // ===========================================================================
  // Background Color Option Tests
  // ===========================================================================

  describe('backgroundColor option', () => {
    it('uses white background when specified', async () => {
      const element = createElement({
        width: '50px',
        height: '50px',
        backgroundColor: 'transparent',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, {
        scale: 1,
        backgroundColor: 'rgb(255, 255, 255)',
      })

      const color = sampleArea(canvas, 20, 20, 5)
      expectColor(color, { r: 255, g: 255, b: 255, a: 255 })
    })

    it('uses custom background color', async () => {
      const element = createElement({
        width: '50px',
        height: '50px',
        backgroundColor: 'transparent',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, {
        scale: 1,
        backgroundColor: 'rgb(100, 150, 200)',
      })

      const color = sampleArea(canvas, 20, 20, 5)
      expectColor(color, { r: 100, g: 150, b: 200, a: 255 }, 5)
    })

    it('preserves transparency when backgroundColor is null', async () => {
      const element = createElement({
        width: '50px',
        height: '50px',
        backgroundColor: 'transparent',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, {
        scale: 1,
        backgroundColor: null,
      })

      const color = getPixel(canvas, 25, 25)
      expect(color.a).toBe(0)
    })
  })
})
