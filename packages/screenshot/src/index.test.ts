import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { page } from 'vitest/browser'
import { screenshot } from './index.js'

// TESTING & DEBUGGING
//
// RUN TESTS:
//   pnpm test
//
// UPDATE SNAPSHOTS:
//   pnpm test --update
//
// DEBUG IN BROWSER (non-headless):
//   pnpm vitest --browser.headless=false
//   pnpm vitest --browser.headless=false -t "gradient text"  # specific test
//
// ON FAILURE:
//   A side-by-side comparison PNG is automatically saved to:
//   src/__failures__/{test-name}-comparison.png
//
//   This shows DOM (expected) vs Canvas (actual), making it easy to debug
//   failures in CI without needing to reproduce locally.
//

// Test Utilities

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

/**
 * Create a side-by-side comparison panel showing DOM vs Canvas output.
 * Returns the panel element for screenshotting.
 */
function createComparisonPanel(
  sourceElement: HTMLElement,
  canvas: HTMLCanvasElement,
  name: string,
  status: 'FAILED' | 'DEBUG' = 'FAILED'
): HTMLElement {
  const panel = document.createElement('div')
  panel.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    z-index: 999999;
    background: #0f172a;
    padding: 16px;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex;
    flex-direction: column;
    gap: 12px;
  `

  // Header
  const header = document.createElement('div')
  header.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    color: ${status === 'FAILED' ? '#f87171' : '#22d3ee'};
  `
  header.textContent = `${status === 'FAILED' ? '❌' : '🔍'} ${status}: ${name}`
  panel.appendChild(header)

  // Comparison container
  const comparison = document.createElement('div')
  comparison.style.cssText = `
    display: flex;
    gap: 16px;
    align-items: flex-start;
  `

  // Left: DOM element (use Playwright to screenshot this)
  const leftWrapper = document.createElement('div')
  leftWrapper.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 4px;
  `
  const leftLabel = document.createElement('div')
  leftLabel.style.cssText = `
    font-size: 10px;
    color: #22d3ee;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  `
  leftLabel.textContent = '← DOM (Expected)'
  const leftContent = document.createElement('div')
  leftContent.setAttribute('data-testid', 'comparison-dom')
  leftContent.style.cssText = `
    background: repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%) 50% / 16px 16px;
    border: 1px solid #334155;
    border-radius: 4px;
    padding: 8px;
    display: inline-block;
  `
  // Clone the source element
  const clonedElement = sourceElement.cloneNode(true) as HTMLElement
  clonedElement.style.position = 'relative'
  leftContent.appendChild(clonedElement)
  leftWrapper.appendChild(leftLabel)
  leftWrapper.appendChild(leftContent)

  // Middle: Arrow
  const arrow = document.createElement('div')
  arrow.style.cssText = `
    color: #475569;
    font-size: 20px;
    padding-top: 20px;
  `
  arrow.textContent = '→'

  // Right: Canvas output
  const rightWrapper = document.createElement('div')
  rightWrapper.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 4px;
  `
  const rightLabel = document.createElement('div')
  rightLabel.style.cssText = `
    font-size: 10px;
    color: #a855f7;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  `
  rightLabel.textContent = 'Canvas (Actual) →'
  const rightContent = document.createElement('div')
  rightContent.setAttribute('data-testid', 'comparison-canvas')
  rightContent.style.cssText = `
    background: repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%) 50% / 16px 16px;
    border: 1px solid #334155;
    border-radius: 4px;
    padding: 8px;
    display: inline-block;
  `
  const canvasClone = canvas.cloneNode(true) as HTMLCanvasElement
  // Copy canvas content
  const ctx = canvasClone.getContext('2d')
  ctx?.drawImage(canvas, 0, 0)
  rightContent.appendChild(canvasClone)
  rightWrapper.appendChild(rightLabel)
  rightWrapper.appendChild(rightContent)

  comparison.appendChild(leftWrapper)
  comparison.appendChild(arrow)
  comparison.appendChild(rightWrapper)
  panel.appendChild(comparison)

  // Footer with dimensions
  const footer = document.createElement('div')
  footer.style.cssText = `
    font-size: 10px;
    color: #64748b;
  `
  footer.textContent = `Canvas: ${canvas.width}×${canvas.height}px`
  panel.appendChild(footer)

  return panel
}

/**
 * Save a side-by-side comparison screenshot on test failure.
 */
async function saveFailureComparison(
  sourceElement: HTMLElement,
  canvas: HTMLCanvasElement,
  name: string
): Promise<void> {
  const panel = createComparisonPanel(sourceElement, canvas, name, 'FAILED')
  panel.setAttribute('data-testid', 'failure-comparison')
  document.body.appendChild(panel)

  try {
    const locator = page.getByTestId('failure-comparison')
    // Save to __failures__/ directory with the test name
    await locator.screenshot({
      path: `src/__failures__/${name}-comparison.png`,
    })
  } finally {
    panel.remove()
  }
}

/**
 * Mount the canvas to the DOM and use Vitest's browser screenshot capability
 * to capture it as an actual PNG file. This tests the full roundtrip:
 * DOM element → our screenshot library → canvas → real browser screenshot
 *
 * On failure, automatically saves a side-by-side comparison to __failures__/.
 *
 * @param canvas - The canvas element from screenshot library
 * @param name - Snapshot name for the test
 * @param sourceElement - Optional: the original DOM element for debug/failure comparison
 */
async function expectCanvasToMatchSnapshot(
  canvas: HTMLCanvasElement,
  name: string,
  sourceElement?: HTMLElement
): Promise<void> {
  // Mount canvas to DOM for screenshot
  const testId = `screenshot-test-${name.replace(/\s+/g, '-')}`
  const wrapper = document.createElement('div')
  wrapper.setAttribute('data-testid', testId)
  wrapper.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    z-index: 999999;
    background: transparent;
  `
  wrapper.appendChild(canvas)
  document.body.appendChild(wrapper)

  try {
    // Use Vitest browser's expect.element and toMatchScreenshot for real PNG comparison
    const locator = page.getByTestId(testId)
    await expect.element(locator).toMatchScreenshot(name)
  } catch (error) {
    // On failure, save a side-by-side comparison for debugging
    if (sourceElement) {
      try {
        await saveFailureComparison(sourceElement, canvas, name)
        console.log(
          `💾 Saved failure comparison to: src/__failures__/${name}-comparison.png`
        )
      } catch (saveError) {
        console.warn('Failed to save comparison screenshot:', saveError)
      }
    }
    throw error
  } finally {
    wrapper.remove()
  }
}

// Tests

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

  // API Tests

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

  // Visual Accuracy Tests - Solid Colors

  describe('visual accuracy: solid colors', () => {
    it('renders solid red correctly', async () => {
      const element = createElement({
        width: '50px',
        height: '50px',
        backgroundColor: 'rgb(255, 0, 0)',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 1 })
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
      expect(color.a).toBe(0)
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

      // Corner should be dark
      const cornerColor = sampleArea(canvas, 5, 5, 5)
      expect(cornerColor.r).toBeLessThan(100)
    })

    it('renders conic gradient', async () => {
      const element = createElement({
        width: '100px',
        height: '100px',
        background:
          'conic-gradient(from 0deg, rgb(255, 0, 0), rgb(0, 255, 0), rgb(0, 0, 255), rgb(255, 0, 0))',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 1 })
      const centerColor = sampleArea(canvas, 45, 45, 10)
      expect(centerColor.a).toBe(255)
    })
  })

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

      const borderColor = sampleArea(canvas, 20, 2, 3)
      expectColor(borderColor, { r: 255, g: 0, b: 0, a: 255 }, 10)

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

      const topBorder = sampleArea(canvas, 30, 3, 3)
      expectColor(topBorder, { r: 255, g: 0, b: 0, a: 255 }, 15)
    })
  })

  describe('visual accuracy: border radius', () => {
    it('renders rounded corners (transparent corners)', async () => {
      const element = createElement({
        width: '50px',
        height: '50px',
        backgroundColor: 'rgb(255, 0, 0)',
        borderRadius: '25px',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, {
        scale: 1,
        backgroundColor: null,
      })

      const centerColor = sampleArea(canvas, 20, 20, 5)
      expectColor(centerColor, { r: 255, g: 0, b: 0, a: 255 }, 10)

      const cornerColor = getPixel(canvas, 2, 2)
      expect(cornerColor.a).toBeLessThan(50)
    })
  })

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

      const outerColor = sampleArea(canvas, 10, 10, 5)
      expectColor(outerColor, { r: 255, g: 0, b: 0, a: 255 }, 10)

      const innerColor = sampleArea(canvas, 50, 50, 5)
      expectColor(innerColor, { r: 0, g: 0, b: 255, a: 255 }, 10)
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

      const centerColor = sampleArea(canvas, 45, 45, 5)
      expectColor(centerColor, { r: 0, g: 0, b: 255, a: 255 }, 10)
    })
  })

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
      const centerColor = sampleArea(canvas, 45, 45, 5)
      expectColor(centerColor, { r: 0, g: 255, b: 0, a: 255 }, 10)
    })
  })

  describe('cropping and dimensions', () => {
    it('crops to specified width and height', async () => {
      const element = createElement({
        width: '100px',
        height: '100px',
        background: 'linear-gradient(to right, rgb(255, 0, 0), rgb(0, 0, 255))',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, {
        scale: 1,
        width: 50,
        height: 50,
      })

      expect(canvas.width).toBe(50)
      expect(canvas.height).toBe(50)

      const color = sampleArea(canvas, 20, 20, 5)
      expect(color.r).toBeGreaterThan(color.b)
    })

    it('crops with x/y offset', async () => {
      const element = createElement({
        width: '100px',
        height: '100px',
        background: 'linear-gradient(to right, rgb(255, 0, 0), rgb(0, 0, 255))',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, {
        scale: 1,
        x: 50,
        y: 0,
        width: 50,
        height: 100,
      })

      expect(canvas.width).toBe(50)
      const color = sampleArea(canvas, 30, 50, 5)
      expect(color.b).toBeGreaterThan(color.r)
    })
  })

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
  })

  describe('backgroundColor option', () => {
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

  describe('image snapshots: gradients', () => {
    it('multi-stop gradient', async () => {
      const element = createElement({
        width: '100px',
        height: '50px',
        background:
          'linear-gradient(to right, #22d3ee, #a855f7 50%, #f97316 100%)',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 1 })
      await expectCanvasToMatchSnapshot(canvas, 'multi-stop-gradient', element)
    })
  })

  describe('image snapshots: borders', () => {
    it('dashed border', async () => {
      const element = createElement({
        width: '120px',
        height: '120px',
        boxSizing: 'border-box',
        padding: '20px',
        backgroundColor: '#1e293b',
        border: '4px dashed #22d3ee',
        borderRadius: '8px',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 2 })
      await expectCanvasToMatchSnapshot(canvas, 'dashed-border', element)
    })
  })

  describe('image snapshots: border radius', () => {
    it('pill shape', async () => {
      const element = createElement({
        width: '100px',
        height: '40px',
        backgroundColor: '#22d3ee',
        borderRadius: '999px',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, {
        scale: 1,
        backgroundColor: null,
      })
      await expectCanvasToMatchSnapshot(canvas, 'pill-shape', element)
    })
  })

  describe('image snapshots: transforms', () => {
    it('3D transformed element', async () => {
      const wrapper = createElement({
        width: '200px',
        height: '150px',
        backgroundColor: '#0f172a',
        perspective: '800px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      })

      const card = createElement({
        width: '120px',
        height: '80px',
        background: 'linear-gradient(135deg, #6366f1, #a855f7)',
        borderRadius: '16px',
        transform: 'rotateY(25deg) rotateX(10deg)',
        transformStyle: 'preserve-3d',
      })

      wrapper.appendChild(card)
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 1 })
      await expectCanvasToMatchSnapshot(canvas, '3d-transform', wrapper)
    })
  })

  describe('image snapshots: text', () => {
    it('gradient text (background-clip: text)', async () => {
      const element = document.createElement('div')
      element.style.cssText = `
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 24px;
        font-weight: 800;
        line-height: 1.25;
        background-image: linear-gradient(90deg, #22d3ee, #a855f7, #f97316);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        padding: 10px;
      `
      element.textContent = 'Gradient Text'
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 2 })
      await expectCanvasToMatchSnapshot(canvas, 'gradient-text', element)
    })

    it('writing-mode vertical-rl', async () => {
      const element = createElement({
        width: '60px',
        height: '120px',
        backgroundColor: '#1e293b',
        padding: '10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      })

      const text = document.createElement('span')
      text.style.cssText = `
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        writing-mode: vertical-rl;
        text-orientation: mixed;
        font-weight: 800;
        font-size: 14px;
        letter-spacing: 0.12em;
        color: white;
      `
      text.textContent = 'VERTICAL'
      element.appendChild(text)
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 2 })
      await expectCanvasToMatchSnapshot(
        canvas,
        'writing-mode-vertical',
        element
      )
    })
  })

  describe('image snapshots: clip and blend', () => {
    it('clip-path polygon', async () => {
      const element = createElement({
        width: '100px',
        height: '100px',
        background: 'linear-gradient(135deg, #a855f7, #6366f1, #22d3ee)',
        clipPath: 'polygon(20% 0%, 100% 10%, 80% 100%, 0% 90%)',
      })
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, {
        scale: 1,
        backgroundColor: null,
      })
      await expectCanvasToMatchSnapshot(canvas, 'clip-path-polygon', element)
    })

    it('mix-blend-mode screen', async () => {
      const wrapper = createElement({
        width: '100px',
        height: '100px',
        backgroundColor: '#1e293b',
        position: 'relative',
        overflow: 'hidden',
      })

      const blendLayer = createElement({
        width: '80px',
        height: '80px',
        borderRadius: '50%',
        background:
          'radial-gradient(circle at 30% 30%, #22d3ee, transparent 60%)',
        position: 'absolute',
        top: '10px',
        left: '10px',
        filter: 'blur(10px)',
        mixBlendMode: 'screen',
      })

      wrapper.appendChild(blendLayer)
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 1 })
      await expectCanvasToMatchSnapshot(
        canvas,
        'mix-blend-mode-screen',
        wrapper
      )
    })

    it('mix-blend-mode screen with two overlapping circles', async () => {
      // Simple case: two overlapping circles with screen blend mode
      const wrapper = createElement({
        width: '150px',
        height: '100px',
        backgroundColor: '#1e293b',
        position: 'relative',
      })

      // Red circle (left)
      const redCircle = createElement({
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100px',
        height: '100px',
        borderRadius: '50%',
        backgroundColor: '#ef4444',
        mixBlendMode: 'screen',
      })

      // Blue circle (right, overlapping with red)
      const blueCircle = createElement({
        position: 'absolute',
        top: '0',
        left: '50px',
        width: '100px',
        height: '100px',
        borderRadius: '50%',
        backgroundColor: '#3b82f6',
        mixBlendMode: 'screen',
      })

      wrapper.appendChild(redCircle)
      wrapper.appendChild(blueCircle)
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 1 })

      // The overlap region (x: 50-100) should show magenta/pink (red + blue screen blend)
      // Let's verify the colors at key positions:
      // - Left (x=25): Red circle only - should be bright red
      // - Center (x=75): Red + Blue overlap - should be magenta/pink (screen blend)
      // - Right (x=125): Blue circle only - should be bright blue

      // For screen blend: result = 1 - (1-src) * (1-dst)
      // Red (#ef4444 ≈ rgb(239, 68, 68)) screened with dark bg should be bright red
      // Blue (#3b82f6 ≈ rgb(59, 130, 246)) screened with dark bg should be bright blue
      // Red + Blue screened should produce magenta (high R, low G, high B)

      const leftColor = sampleArea(canvas, 25, 50, 5)
      const rightColor = sampleArea(canvas, 125, 50, 5)
      const overlapColor = sampleArea(canvas, 75, 50, 5)

      // Left should be red-ish (high R, low G, low B)
      expect(leftColor.r).toBeGreaterThan(200)
      expect(leftColor.g).toBeLessThan(150)

      // Right should be blue-ish (low R, medium G, high B)
      expect(rightColor.b).toBeGreaterThan(200)
      expect(rightColor.r).toBeLessThan(150)

      // Overlap should show screen blend - both R and B should be high
      // Screen of red and blue should produce magenta-ish (high R, medium/low G, high B)
      expect(overlapColor.r).toBeGreaterThan(200) // Red contribution
      expect(overlapColor.b).toBeGreaterThan(200) // Blue contribution
      // G should be relatively low (neither red nor blue have much green)
    })

    it('mix-blend-mode screen with three overlapping circles (no transform)', async () => {
      // Three overlapping circles, positioned explicitly without transform
      const wrapper = createElement({
        width: '200px',
        height: '175px',
        backgroundColor: '#1e293b',
        position: 'relative',
      })

      // Red circle (top-left)
      const redCircle = createElement({
        position: 'absolute',
        top: '0',
        left: '0',
        width: '128px',
        height: '128px',
        borderRadius: '50%',
        backgroundColor: '#ef4444',
        mixBlendMode: 'screen',
      })

      // Green circle (top-right, overlapping with red)
      const greenCircle = createElement({
        position: 'absolute',
        top: '0',
        left: '72px',
        width: '128px',
        height: '128px',
        borderRadius: '50%',
        backgroundColor: '#22c55e',
        mixBlendMode: 'screen',
      })

      // Blue circle (bottom-center, overlapping with both)
      const blueCircle = createElement({
        position: 'absolute',
        top: '47px',
        left: '36px',
        width: '128px',
        height: '128px',
        borderRadius: '50%',
        backgroundColor: '#3b82f6',
        mixBlendMode: 'screen',
      })

      wrapper.appendChild(redCircle)
      wrapper.appendChild(greenCircle)
      wrapper.appendChild(blueCircle)
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 1 })

      // Verify overlap regions show correct blending
      // Red + Green (yellow-ish): around x=100, y=50
      // Red + Blue (magenta): around x=50, y=90
      // Green + Blue (cyan): around x=130, y=90
      // All three (white-ish): around x=100, y=80

      // Sample the triple-overlap region (should be very bright, near white)
      const tripleOverlap = sampleArea(canvas, 100, 75, 5)

      // All channels should be bright due to screen blending all three colors
      expect(tripleOverlap.r).toBeGreaterThan(220)
      expect(tripleOverlap.g).toBeGreaterThan(220)
      expect(tripleOverlap.b).toBeGreaterThan(220)
    })

    it('mix-blend-mode with transform (regression test)', async () => {
      // Test that mix-blend-mode works correctly with CSS transforms
      const wrapper = createElement({
        width: '200px',
        height: '150px',
        backgroundColor: '#1e293b',
        position: 'relative',
      })

      // Red circle (no transform)
      const redCircle = createElement({
        position: 'absolute',
        top: '0',
        left: '25px',
        width: '100px',
        height: '100px',
        borderRadius: '50%',
        backgroundColor: '#ef4444',
        mixBlendMode: 'screen',
      })

      // Blue circle (with transform, overlapping with red)
      const blueCircle = createElement({
        position: 'absolute',
        top: '25px',
        left: '125px',
        transform: 'translateX(-50px)',
        width: '100px',
        height: '100px',
        borderRadius: '50%',
        backgroundColor: '#3b82f6',
        mixBlendMode: 'screen',
      })

      wrapper.appendChild(redCircle)
      wrapper.appendChild(blueCircle)
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 1 })

      // The overlap region should show screen blend of red + blue = magenta
      // Blue circle after transform is at left: 125 - 50 = 75px
      // Overlap region: x=75 to x=125, y=25 to y=100
      // Sample at the center of overlap: x=100, y=62
      const overlapColor = sampleArea(canvas, 100, 62, 5)

      // Both R and B should be high (screen blend of red and blue)
      expect(overlapColor.r).toBeGreaterThan(200)
      expect(overlapColor.b).toBeGreaterThan(200)
    })

    it('mix-blend-mode with right positioning', async () => {
      // Test blend mode with element using right: 0 positioning
      const wrapper = createElement({
        width: '200px',
        height: '100px',
        backgroundColor: '#1e293b',
        position: 'relative',
      })

      // Red circle (using left positioning)
      const redCircle = createElement({
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100px',
        height: '100px',
        borderRadius: '50%',
        backgroundColor: '#ef4444',
        mixBlendMode: 'screen',
      })

      // Blue circle (using right positioning)
      const blueCircle = createElement({
        position: 'absolute',
        top: '0',
        right: '0',
        width: '100px',
        height: '100px',
        borderRadius: '50%',
        backgroundColor: '#3b82f6',
        mixBlendMode: 'screen',
      })

      wrapper.appendChild(redCircle)
      wrapper.appendChild(blueCircle)
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 1 })

      // Blue circle with right: 0 on 200px width = left edge at 100px
      // Red ends at 100px, blue starts at 100px - they should be adjacent, not overlapping
      // Let's verify: red at x=50, blue at x=150
      const redColor = sampleArea(canvas, 50, 50, 5)
      const blueColor = sampleArea(canvas, 150, 50, 5)

      expect(redColor.r).toBeGreaterThan(200)
      expect(blueColor.b).toBeGreaterThan(200)
    })

    it('mix-blend-mode with overlapping using right positioning', async () => {
      // Test blend mode with overlapping elements using right: 0 positioning
      const wrapper = createElement({
        width: '150px',
        height: '100px',
        backgroundColor: '#1e293b',
        position: 'relative',
      })

      // Red circle (using left positioning)
      const redCircle = createElement({
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100px',
        height: '100px',
        borderRadius: '50%',
        backgroundColor: '#ef4444',
        mixBlendMode: 'screen',
      })

      // Blue circle (using right positioning, will overlap with red)
      const blueCircle = createElement({
        position: 'absolute',
        top: '0',
        right: '0',
        width: '100px',
        height: '100px',
        borderRadius: '50%',
        backgroundColor: '#3b82f6',
        mixBlendMode: 'screen',
      })

      wrapper.appendChild(redCircle)
      wrapper.appendChild(blueCircle)
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 1 })

      // Blue circle with right: 0 on 150px width = left edge at 50px
      // Red spans 0-100, Blue spans 50-150
      // Overlap region: 50-100
      const overlapColor = sampleArea(canvas, 75, 50, 5)

      // Should have both high R and high B (screen blend of red + blue)
      expect(overlapColor.r).toBeGreaterThan(200)
      expect(overlapColor.b).toBeGreaterThan(200)
    })

    it('mix-blend-mode with left percentage + transform', async () => {
      // Test the specific pattern: left: 50% + transform: translateX(-50%)
      const wrapper = createElement({
        width: '200px',
        height: '100px',
        backgroundColor: '#1e293b',
        position: 'relative',
      })

      // Red circle (simple positioning)
      const redCircle = createElement({
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100px',
        height: '100px',
        borderRadius: '50%',
        backgroundColor: '#ef4444',
        mixBlendMode: 'screen',
      })

      // Blue circle (using left: 50% + transform: translateX(-50%))
      // This centers the element at x=100 (50% of 200), then shifts left by 50px (50% of 100)
      // Result: left edge at 50px, right edge at 150px
      const blueCircle = createElement({
        position: 'absolute',
        top: '0',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100px',
        height: '100px',
        borderRadius: '50%',
        backgroundColor: '#3b82f6',
        mixBlendMode: 'screen',
      })

      wrapper.appendChild(redCircle)
      wrapper.appendChild(blueCircle)
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 1 })

      // Red spans 0-100, Blue spans 50-150
      // Overlap region: 50-100
      const overlapColor = sampleArea(canvas, 75, 50, 5)

      // Should have both high R and high B (screen blend)
      expect(overlapColor.r).toBeGreaterThan(200)
      expect(overlapColor.b).toBeGreaterThan(200)
    })

    it('mix-blend-mode with bottom positioning', async () => {
      // Test blend mode with element using bottom: 0 positioning
      const wrapper = createElement({
        width: '100px',
        height: '150px',
        backgroundColor: '#1e293b',
        position: 'relative',
      })

      // Red circle (using top positioning)
      const redCircle = createElement({
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100px',
        height: '100px',
        borderRadius: '50%',
        backgroundColor: '#ef4444',
        mixBlendMode: 'screen',
      })

      // Blue circle (using bottom positioning, will overlap with red)
      const blueCircle = createElement({
        position: 'absolute',
        bottom: '0',
        left: '0',
        width: '100px',
        height: '100px',
        borderRadius: '50%',
        backgroundColor: '#3b82f6',
        mixBlendMode: 'screen',
      })

      wrapper.appendChild(redCircle)
      wrapper.appendChild(blueCircle)
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 1 })

      // Red spans y=0-100, Blue spans y=50-150
      // Overlap region: y=50-100
      const overlapColor = sampleArea(canvas, 50, 75, 5)

      // Should have both high R and high B (screen blend)
      expect(overlapColor.r).toBeGreaterThan(200)
      expect(overlapColor.b).toBeGreaterThan(200)
    })

    it('mix-blend-mode screen with multiple overlapping circles (BlendModeExample layout)', async () => {
      // Matches the BlendModeExample from CSSExamples.tsx
      // Layout:
      //   Red: top-left (0-128, 0-128)
      //   Green: top-right (128-256, 0-128)
      //   Blue: bottom-center (64-192, 64-192)
      // Overlaps:
      //   Red + Blue: (64-128, 64-128)
      //   Green + Blue: (128-192, 64-128)
      const wrapper = createElement({
        width: '256px',
        height: '192px',
        backgroundColor: '#3d4555',
        position: 'relative',
      })

      // Red circle (top-left)
      const redCircle = createElement({
        position: 'absolute',
        top: '0',
        left: '0',
        width: '128px',
        height: '128px',
        borderRadius: '50%',
        backgroundColor: '#ef4444',
        mixBlendMode: 'screen',
      })

      // Green circle (top-right)
      const greenCircle = createElement({
        position: 'absolute',
        top: '0',
        right: '0',
        width: '128px',
        height: '128px',
        borderRadius: '50%',
        backgroundColor: '#22c55e',
        mixBlendMode: 'screen',
      })

      // Blue circle (bottom-center with transform)
      const blueCircle = createElement({
        position: 'absolute',
        bottom: '0',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '128px',
        height: '128px',
        borderRadius: '50%',
        backgroundColor: '#3b82f6',
        mixBlendMode: 'screen',
      })

      wrapper.appendChild(redCircle)
      wrapper.appendChild(greenCircle)
      wrapper.appendChild(blueCircle)
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 1 })

      // Sample the overlap regions
      const redBlueOverlap = sampleArea(canvas, 96, 96, 5) // Red+Blue overlap
      const greenBlueOverlap = sampleArea(canvas, 160, 96, 5) // Green+Blue overlap

      // Verify red+blue overlap has both high R and high B (magenta)
      expect(redBlueOverlap.r).toBeGreaterThan(200)
      expect(redBlueOverlap.b).toBeGreaterThan(200)

      // Verify green+blue overlap has both high G and high B (cyan)
      // This was the key failing assertion before the fix - blue wasn't rendering
      // in this region because the transform was being applied twice.
      expect(greenBlueOverlap.g).toBeGreaterThan(200)
      expect(greenBlueOverlap.b).toBeGreaterThan(200)

      // Compare to DOM-rendered version via snapshot
      await expectCanvasToMatchSnapshot(
        canvas,
        'mix-blend-mode-overlapping-circles',
        wrapper
      )
    })

    it('border-radius 50% creates perfect circle (128px)', async () => {
      // Regression test: verify that 50% border-radius creates a proper circle
      // Using 128px specifically because 50% = 64px, not 50px
      const wrapper = createElement({
        width: '128px',
        height: '128px',
        backgroundColor: '#1e293b',
        position: 'relative',
      })

      const circle = createElement({
        position: 'absolute',
        top: '0',
        left: '0',
        width: '128px',
        height: '128px',
        borderRadius: '50%',
        backgroundColor: '#ef4444',
      })

      wrapper.appendChild(circle)
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 1 })

      // Sample corners - they should be background color (circle should not touch corners)
      const topLeftCorner = sampleArea(canvas, 3, 3, 2)
      const topRightCorner = sampleArea(canvas, 124, 3, 2)
      const bottomLeftCorner = sampleArea(canvas, 3, 124, 2)
      const bottomRightCorner = sampleArea(canvas, 124, 124, 2)

      // Corners should show background color (dark blue #1e293b ≈ rgb(30, 41, 59))
      expect(topLeftCorner.r).toBeLessThan(100)
      expect(topRightCorner.r).toBeLessThan(100)
      expect(bottomLeftCorner.r).toBeLessThan(100)
      expect(bottomRightCorner.r).toBeLessThan(100)

      // Sample center - should be red
      const center = sampleArea(canvas, 64, 64, 5)
      expect(center.r).toBeGreaterThan(200)

      // Sample midpoints of edges - should be red (circle touches edge centers)
      const topCenter = sampleArea(canvas, 64, 2, 2)
      const rightCenter = sampleArea(canvas, 125, 64, 2)
      const bottomCenter = sampleArea(canvas, 64, 125, 2)
      const leftCenter = sampleArea(canvas, 2, 64, 2)

      expect(topCenter.r).toBeGreaterThan(200)
      expect(rightCenter.r).toBeGreaterThan(200)
      expect(bottomCenter.r).toBeGreaterThan(200)
      expect(leftCenter.r).toBeGreaterThan(200)

      // Visual comparison with DOM
      await expectCanvasToMatchSnapshot(canvas, 'circle-128px', wrapper)
    })
  })

  describe('image snapshots: SVG', () => {
    it('SVG with gradient fill', async () => {
      const wrapper = createElement({
        width: '150px',
        height: '150px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0f172a',
      })

      wrapper.innerHTML = `
        <svg width="120" height="120" viewBox="0 0 120 120">
          <defs>
            <linearGradient id="test-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#22d3ee" />
              <stop offset="50%" stop-color="#6366f1" />
              <stop offset="100%" stop-color="#a855f7" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="50" fill="url(#test-grad)" />
        </svg>
      `
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 1 })
      await expectCanvasToMatchSnapshot(canvas, 'svg-gradient-fill', wrapper)
    })

    it('SVG with stroke dash', async () => {
      const wrapper = createElement({
        width: '150px',
        height: '150px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0f172a',
      })

      wrapper.innerHTML = `
        <svg width="120" height="120" viewBox="0 0 120 120">
          <defs>
            <linearGradient id="stroke-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#22d3ee" />
              <stop offset="100%" stop-color="#a855f7" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="40" fill="none" stroke="url(#stroke-grad)" 
            stroke-width="8" stroke-linecap="round" stroke-dasharray="60 40" />
        </svg>
      `
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 1 })
      await expectCanvasToMatchSnapshot(canvas, 'svg-stroke-dash', wrapper)
    })
  })

  describe('image snapshots: layouts', () => {
    it('grid layout', async () => {
      const grid = createElement({
        width: '200px',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px',
        padding: '8px',
        backgroundColor: '#0f172a',
      })

      const colors = [
        '#22d3ee',
        '#6366f1',
        '#a855f7',
        '#f97316',
        '#10b981',
        '#f43f5e',
      ]
      colors.forEach((color) => {
        const cell = createElement({
          height: '40px',
          backgroundColor: color,
          borderRadius: '8px',
        })
        grid.appendChild(cell)
      })

      container.appendChild(grid)

      const canvas = await screenshot.canvas(grid, { scale: 1 })
      await expectCanvasToMatchSnapshot(canvas, 'grid-layout', grid)
    })

    it('flexbox layout', async () => {
      const flex = createElement({
        width: '200px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        padding: '8px',
        backgroundColor: '#1e293b',
      })

      for (let i = 0; i < 5; i++) {
        const item = createElement({
          width: '60px',
          height: '40px',
          background: `hsl(${i * 60}, 70%, 60%)`,
          borderRadius: '6px',
        })
        flex.appendChild(item)
      }

      container.appendChild(flex)

      const canvas = await screenshot.canvas(flex, { scale: 1 })
      await expectCanvasToMatchSnapshot(canvas, 'flexbox-layout', flex)
    })
  })

  describe('image snapshots: UI components', () => {
    it('toggle switch', async () => {
      const toggle = createElement({
        width: '44px',
        height: '24px',
        background: '#10b981',
        borderRadius: '999px',
        position: 'relative',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
      })

      const knob = createElement({
        position: 'absolute',
        top: '2px',
        left: '22px',
        width: '20px',
        height: '20px',
        background: 'white',
        borderRadius: '50%',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
      })

      toggle.appendChild(knob)
      container.appendChild(toggle)

      const canvas = await screenshot.canvas(toggle, { scale: 2 })
      await expectCanvasToMatchSnapshot(canvas, 'toggle-switch', toggle)
    })

    it('avatar with border', async () => {
      const avatar = createElement({
        width: '60px',
        height: '60px',
        borderRadius: '50%',
        border: '3px solid white',
        boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
        background: 'linear-gradient(135deg, #6366f1, #a855f7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontSize: '24px',
        fontWeight: 'bold',
      })
      avatar.textContent = 'A'
      container.appendChild(avatar)

      const canvas = await screenshot.canvas(avatar, { scale: 2 })
      await expectCanvasToMatchSnapshot(canvas, 'avatar-with-border', avatar)
    })

    it('stat card', async () => {
      const card = createElement({
        borderRadius: '16px',
        padding: '12px 16px',
        background: 'rgba(15,23,42,0.85)',
        border: '1px solid rgba(148,163,184,0.24)',
        width: '120px',
      })

      const label = document.createElement('div')
      label.style.cssText = `
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        opacity: 0.65;
        margin-bottom: 4px;
        color: white;
      `
      label.textContent = 'Resolution'

      const value = document.createElement('div')
      value.style.cssText = `
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 800;
        color: white;
      `
      value.textContent = 'DPR-dependent'

      card.appendChild(label)
      card.appendChild(value)
      container.appendChild(card)

      const canvas = await screenshot.canvas(card, { scale: 2 })
      await expectCanvasToMatchSnapshot(canvas, 'stat-card', card)
    })
  })

  describe('image snapshots: text shadow', () => {
    it('text with drop shadow', async () => {
      const element = document.createElement('div')
      element.style.cssText = `
        padding: 20px;
        background: #0f172a;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 24px;
        font-weight: 800;
        color: white;
        text-shadow: 0 10px 20px rgba(0,0,0,0.5);
      `
      element.textContent = 'Shadow Text'
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 2 })
      await expectCanvasToMatchSnapshot(canvas, 'text-drop-shadow', element)
    })

    it('text with multiple shadows', async () => {
      const element = document.createElement('div')
      element.style.cssText = `
        padding: 20px;
        background: #0f172a;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 24px;
        font-weight: 800;
        color: #22d3ee;
        text-shadow: 
          0 0 10px rgba(34,211,238,0.8),
          0 0 30px rgba(34,211,238,0.4),
          0 0 60px rgba(34,211,238,0.2);
      `
      element.textContent = 'Glow Text'
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 2 })
      await expectCanvasToMatchSnapshot(
        canvas,
        'text-multiple-shadows',
        element
      )
    })
  })

  describe('image snapshots: data URL images', () => {
    it('base64 SVG pattern background', async () => {
      const element = createElement({
        width: '100px',
        height: '100px',
        backgroundColor: '#1e293b',
        position: 'relative',
      })

      // Noise pattern using base64-encoded SVG
      const noise = createElement({
        position: 'absolute',
        inset: '0',
        backgroundImage:
          "url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjwvc3ZnPg==')",
        opacity: '0.8',
        pointerEvents: 'none',
      })

      element.appendChild(noise)
      container.appendChild(element)

      const canvas = await screenshot.canvas(element, { scale: 2 })
      await expectCanvasToMatchSnapshot(canvas, 'data-url-svg-pattern', element)
    })
  })

  describe('image snapshots: advanced SVG', () => {
    it('SVG with radialGradient', async () => {
      const wrapper = createElement({
        width: '150px',
        height: '150px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0f172a',
      })

      wrapper.innerHTML = `
        <svg width="120" height="120" viewBox="0 0 120 120">
          <defs>
            <radialGradient id="test-radial" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="rgba(248,250,252,0.9)" />
              <stop offset="40%" stop-color="rgba(148,163,184,0.5)" />
              <stop offset="100%" stop-color="rgba(15,23,42,0.0)" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width="120" height="120" rx="18" fill="url(#test-radial)" />
        </svg>
      `
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 1 })
      await expectCanvasToMatchSnapshot(canvas, 'svg-radial-gradient', wrapper)
    })

    it('SVG with group transforms', async () => {
      const wrapper = createElement({
        width: '150px',
        height: '150px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0f172a',
      })

      wrapper.innerHTML = `
        <svg width="120" height="120" viewBox="0 0 120 120">
          <defs>
            <linearGradient id="orb-grad-test" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#22d3ee" />
              <stop offset="50%" stop-color="#6366f1" />
              <stop offset="100%" stop-color="#a855f7" />
            </linearGradient>
          </defs>
          <g transform="translate(60 60) rotate(-28)">
            <circle cx="0" cy="0" r="32" fill="none" stroke="rgba(15,23,42,0.85)" stroke-width="14" />
            <circle cx="0" cy="0" r="32" fill="none" stroke="url(#orb-grad-test)" 
              stroke-width="10" stroke-linecap="round" stroke-dasharray="120 220" stroke-dashoffset="30" />
            <circle cx="24" cy="-8" r="6" fill="url(#orb-grad-test)" stroke="#0f172a" stroke-width="2" />
          </g>
        </svg>
      `
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 1 })
      await expectCanvasToMatchSnapshot(
        canvas,
        'svg-group-transforms-with-dashoffset',
        wrapper
      )
    })
  })

  describe('image snapshots: 3D transforms', () => {
    it('translateZ depth effect', async () => {
      const wrapper = createElement({
        width: '200px',
        height: '150px',
        backgroundColor: '#0f172a',
        perspective: '800px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      })

      const card = document.createElement('div')
      card.style.cssText = `
        width: 140px;
        height: 90px;
        background: linear-gradient(135deg, #6366f1, #a855f7);
        border-radius: 16px;
        transform: rotateY(282deg) rotateX(10deg);
        transform-style: preserve-3d;
        box-shadow: 20px 20px 30px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(255,255,255,0.2);
      `

      const text = document.createElement('span')
      text.style.cssText = `
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-weight: 900;
        font-size: 16px;
        color: white;
        transform: translateZ(20px);
      `
      text.textContent = '3D Card'

      card.appendChild(text)
      wrapper.appendChild(card)
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 2 })
      await expectCanvasToMatchSnapshot(canvas, 'translatez-depth', wrapper)
    })
  })

  describe('image snapshots: circular clip with overflow', () => {
    it('circular avatar with clipped content', async () => {
      const avatar = document.createElement('div')
      avatar.style.cssText = `
        width: 64px;
        height: 64px;
        border-radius: 50%;
        overflow: hidden;
        border: 2px solid white;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        background: linear-gradient(135deg, #6366f1, #a855f7);
      `
      container.appendChild(avatar)

      const canvas = await screenshot.canvas(avatar, { scale: 2 })
      await expectCanvasToMatchSnapshot(
        canvas,
        'circular-avatar-clipped',
        avatar
      )
    })
  })

  describe('image snapshots: stress tests', () => {
    it('card with glow effects', async () => {
      const card = document.createElement('div')
      card.style.cssText = `
        width: 300px;
        padding: 24px;
        border-radius: 20px;
        background: radial-gradient(circle at top left, #0f172a 0%, #020617 40%, #111827 100%);
        box-shadow: 0 30px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(148,163,184,0.15);
        color: #e5e7eb;
        position: relative;
        overflow: hidden;
      `

      const glow = document.createElement('div')
      glow.style.cssText = `
        position: absolute;
        inset: -50px;
        background: radial-gradient(circle at 0% 0%, rgba(56,189,248,0.14), transparent 55%),
                    radial-gradient(circle at 100% 0%, rgba(165,180,252,0.16), transparent 50%);
        pointer-events: none;
      `

      const title = document.createElement('h2')
      title.style.cssText = `
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 20px;
        margin: 0;
        background: linear-gradient(to bottom right, #ffffff, #94a3b8);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      `
      title.textContent = 'Stress Test Card'

      card.appendChild(glow)
      card.appendChild(title)
      container.appendChild(card)

      const canvas = await screenshot.canvas(card, { scale: 2 })
      await expectCanvasToMatchSnapshot(canvas, 'card-with-glow', card)
    })

    it('3D perspective card', async () => {
      const wrapper = document.createElement('div')
      wrapper.style.cssText = `
        width: 250px;
        height: 180px;
        background: #0f172a;
        perspective: 800px;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 20px;
      `

      const card = document.createElement('div')
      card.style.cssText = `
        width: 180px;
        height: 100px;
        background: linear-gradient(135deg, #6366f1, #a855f7);
        border-radius: 16px;
        transform: rotateY(25deg) rotateX(10deg);
        transform-style: preserve-3d;
        box-shadow: 20px 20px 30px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(255,255,255,0.2);
        color: white;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-weight: 900;
        font-size: 18px;
      `
      card.textContent = '3D Card'

      wrapper.appendChild(card)
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 2 })
      await expectCanvasToMatchSnapshot(canvas, '3d-perspective-card', wrapper)
    })

    it('conic gradient ring', async () => {
      const ring = document.createElement('div')
      ring.style.cssText = `
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: conic-gradient(from 180deg, #22d3ee, #a855f7, #6366f1, #22d3ee);
        padding: 3px;
        transform: rotate(10deg);
        box-shadow: 0 0 24px rgba(59,130,246,0.7);
      `

      const inner = document.createElement('div')
      inner.style.cssText = `
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background: #020617;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        transform: rotate(-10deg);
      `
      inner.textContent = '🎥'

      ring.appendChild(inner)
      container.appendChild(ring)

      const canvas = await screenshot.canvas(ring, { scale: 2 })
      await expectCanvasToMatchSnapshot(canvas, 'conic-gradient-ring', ring)
    })
  })

  describe('image snapshots: backdrop-filter', () => {
    it('glassmorphism card with backdrop blur', async () => {
      // Container with colorful background elements
      const wrapper = document.createElement('div')
      wrapper.style.cssText = `
        position: relative;
        width: 320px;
        height: 200px;
        background: #1e293b;
        border-radius: 16px;
        overflow: hidden;
      `

      // Gradient background blob
      const gradientBlob = document.createElement('div')
      gradientBlob.style.cssText = `
        position: absolute;
        inset: 0;
        background: linear-gradient(to right, #ec4899, #a855f7, #6366f1);
        border-radius: 16px;
        filter: blur(16px);
        opacity: 0.6;
      `

      // Yellow accent circle
      const yellowCircle = document.createElement('div')
      yellowCircle.style.cssText = `
        position: absolute;
        top: 16px;
        left: 32px;
        width: 80px;
        height: 80px;
        background-color: #facc15;
        border-radius: 50%;
        filter: blur(4px);
        opacity: 0.8;
      `

      // Cyan accent circle
      const cyanCircle = document.createElement('div')
      cyanCircle.style.cssText = `
        position: absolute;
        bottom: 32px;
        right: 16px;
        width: 64px;
        height: 64px;
        background-color: #22d3ee;
        border-radius: 50%;
        filter: blur(4px);
        opacity: 0.8;
      `

      // Glass card with backdrop-filter
      const glassCard = document.createElement('div')
      glassCard.style.cssText = `
        position: relative;
        margin: 40px;
        border-radius: 16px;
        padding: 24px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
      `

      const title = document.createElement('h3')
      title.style.cssText = `
        color: white;
        font-weight: bold;
        font-size: 18px;
        margin: 0 0 8px 0;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `
      title.textContent = 'Glass Card'

      const text = document.createElement('p')
      text.style.cssText = `
        color: rgba(255, 255, 255, 0.7);
        font-size: 14px;
        margin: 0;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `
      text.textContent = 'Backdrop blur with transparency'

      glassCard.appendChild(title)
      glassCard.appendChild(text)

      wrapper.appendChild(gradientBlob)
      wrapper.appendChild(yellowCircle)
      wrapper.appendChild(cyanCircle)
      wrapper.appendChild(glassCard)
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 2 })
      await expectCanvasToMatchSnapshot(canvas, 'glassmorphism-card', wrapper)
    })
  })

  describe('image snapshots: form controls with positioned icons', () => {
    it('SVG icon positioned with translateY(-50%) inside form input', async () => {
      // This tests the fix for SVG elements with CSS transforms.
      // Previously, SVG elements fell back to a broken center-based approximation
      // when calculating layout rects, causing icons to be mispositioned.
      const wrapper = createElement({
        width: '280px',
        padding: '16px',
        backgroundColor: '#1e293b',
        borderRadius: '12px',
      })

      const inputContainer = createElement({
        position: 'relative',
        width: '100%',
      })

      const input = document.createElement('input')
      input.type = 'text'
      input.placeholder = 'Email Address'
      input.style.cssText = `
        width: 100%;
        box-sizing: border-box;
        padding: 12px 16px;
        padding-left: 44px;
        font-size: 14px;
        border-radius: 8px;
        border: 1px solid rgba(148, 163, 184, 0.2);
        background-color: rgba(15, 23, 42, 0.6);
        color: #f1f5f9;
        outline: none;
      `

      // Create an inline SVG icon positioned with translateY(-50%)
      const svgNS = 'http://www.w3.org/2000/svg'
      const svg = document.createElementNS(svgNS, 'svg')
      svg.setAttribute('width', '18')
      svg.setAttribute('height', '18')
      svg.setAttribute('viewBox', '0 0 24 24')
      svg.setAttribute('fill', 'none')
      svg.setAttribute('stroke', 'rgba(148, 163, 184, 0.5)')
      svg.setAttribute('stroke-width', '2')
      svg.setAttribute('stroke-linecap', 'round')
      svg.setAttribute('stroke-linejoin', 'round')
      svg.style.cssText = `
        position: absolute;
        left: 14px;
        top: 50%;
        transform: translateY(-50%);
        pointer-events: none;
      `

      // Email icon path (envelope)
      const path = document.createElementNS(svgNS, 'path')
      path.setAttribute(
        'd',
        'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'
      )
      svg.appendChild(path)

      inputContainer.appendChild(input)
      inputContainer.appendChild(svg)
      wrapper.appendChild(inputContainer)
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 2 })

      // Verify the icon is rendered in the correct position
      // The icon should be centered vertically within the input field
      // The screenshot shows the icon correctly positioned at left ~14px, vertically centered

      // Sample the area where the icon stroke should be visible
      // Canvas is at 2x scale, so CSS coordinates need to be multiplied by 2
      // Icon is at CSS left: 14px + 16px wrapper padding = 30px, vertically centered
      // Looking at the envelope icon, the stroke should be visible around (30*2, 30*2) = (60, 60)
      const iconArea = sampleArea(canvas, 60, 58, 6)

      // The icon stroke is rgba(148, 163, 184, 0.5) blended with dark background
      // We just verify something is rendered there (not pure black or pure background)
      // Background alone would be very dark (~15, 23, 42)
      // Icon stroke adds some lightness
      expect(iconArea.a).toBe(255) // Fully opaque

      // Visual comparison - this is the main verification that positioning is correct
      await expectCanvasToMatchSnapshot(
        canvas,
        'form-input-with-icon-translatey',
        wrapper
      )
    })

    it('SVG icon with rem units via stylesheet', async () => {
      // This tests CSS via stylesheet (more like CSS-in-JS) instead of inline styles
      const style = document.createElement('style')
      style.textContent = `
        .test-wrapper {
          width: 280px;
          padding: 16px;
          background-color: #1e293b;
          border-radius: 12px;
        }
        .test-container {
          position: relative;
          width: 100%;
        }
        .test-input {
          width: 100%;
          box-sizing: border-box;
          padding: 12px 16px;
          padding-left: 44px;
          font-size: 14px;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background-color: rgba(15, 23, 42, 0.6);
          color: #f1f5f9;
          outline: none;
        }
        .test-icon {
          position: absolute;
          left: 1rem;
          top: 50%;
          transform: translateY(-50%);
          width: 18px;
          height: 18px;
          pointer-events: none;
        }
      `
      document.head.appendChild(style)

      const wrapper = document.createElement('div')
      wrapper.className = 'test-wrapper'

      const inputContainer = document.createElement('div')
      inputContainer.className = 'test-container'

      const input = document.createElement('input')
      input.type = 'text'
      input.placeholder = 'Email Address'
      input.className = 'test-input'

      const svgNS = 'http://www.w3.org/2000/svg'
      const svg = document.createElementNS(svgNS, 'svg')
      svg.setAttribute('viewBox', '0 0 24 24')
      svg.setAttribute('fill', 'none')
      svg.setAttribute('stroke', 'rgba(148, 163, 184, 0.5)')
      svg.setAttribute('stroke-width', '2')
      svg.setAttribute('stroke-linecap', 'round')
      svg.setAttribute('stroke-linejoin', 'round')
      svg.setAttribute('class', 'test-icon')

      const path = document.createElementNS(svgNS, 'path')
      path.setAttribute(
        'd',
        'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'
      )
      svg.appendChild(path)

      inputContainer.appendChild(input)
      inputContainer.appendChild(svg)
      wrapper.appendChild(inputContainer)
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 2 })

      // Visual comparison - the icon should be at 1rem (16px) from input container left
      await expectCanvasToMatchSnapshot(
        canvas,
        'form-input-with-icon-rem-stylesheet',
        wrapper
      )

      // Cleanup
      document.head.removeChild(style)
    })

    it('captures ::placeholder text color for inputs', async () => {
      const style = document.createElement('style')
      style.textContent = `
        .ph-wrapper {
          width: 320px;
          padding: 16px;
          background-color: #0f172a;
        }
        .ph-input {
          width: 280px;
          box-sizing: border-box;
          padding: 12px 16px;
          font-size: 14px;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background-color: rgba(15, 23, 42, 0.6);
          color: #f1f5f9;
          outline: none;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .ph-input::placeholder {
          color: rgba(148, 163, 184, 0.6);
        }
      `
      document.head.appendChild(style)

      const wrapper = document.createElement('div')
      wrapper.className = 'ph-wrapper'

      const input = document.createElement('input')
      input.type = 'text'
      input.placeholder = 'Email Address'
      input.className = 'ph-input'

      wrapper.appendChild(input)
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 2 })

      // Sample a pixel in the placeholder text area (left padding 16px + wrapper padding 16px).
      // At 2x scale, sample around x ~ (16+16+2)*2 = ~68, y ~ (16+12+7)*2 = ~70.
      const placeholderSample = sampleArea(canvas, 70, 70, 4)
      // Ensure it's not the normal input text color (near-white). Placeholder should be darker/greyer.
      expect(placeholderSample.a).toBe(255)
      expect(placeholderSample.r).toBeLessThan(235)
      expect(placeholderSample.g).toBeLessThan(235)
      expect(placeholderSample.b).toBeLessThan(240)

      await expectCanvasToMatchSnapshot(
        canvas,
        'input-placeholder-color',
        wrapper
      )

      document.head.removeChild(style)
    })

    it('captures WebKit placeholder paint (-webkit-text-fill-color via ::-webkit-input-placeholder)', async () => {
      const style = document.createElement('style')
      style.textContent = `
        .phw-wrapper {
          width: 320px;
          padding: 16px;
          background-color: #0f172a;
        }
        .phw-input {
          width: 280px;
          box-sizing: border-box;
          padding: 12px 16px;
          font-size: 14px;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background-color: rgba(15, 23, 42, 0.6);
          color: #f1f5f9;
          outline: none;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .phw-input::-webkit-input-placeholder {
          color: rgba(80, 200, 120, 0.85);
          -webkit-text-fill-color: rgba(80, 200, 120, 0.85);
        }
      `
      document.head.appendChild(style)

      const wrapper = document.createElement('div')
      wrapper.className = 'phw-wrapper'

      const input = document.createElement('input')
      input.type = 'text'
      input.placeholder = 'Email Address'
      input.className = 'phw-input'

      wrapper.appendChild(input)
      container.appendChild(wrapper)

      const canvas = await screenshot.canvas(wrapper, { scale: 2 })

      // Sample a pixel in the placeholder text area (similar to the other placeholder test).
      const sample = sampleArea(canvas, 70, 70, 4)
      expect(sample.a).toBe(255)
      // Expect it to be noticeably greenish (placeholder fill is green, not white/grey).
      expect(sample.g).toBeGreaterThan(sample.r + 10)
      expect(sample.g).toBeGreaterThan(sample.b + 10)

      await expectCanvasToMatchSnapshot(
        canvas,
        'input-placeholder-color-webkit-text-fill',
        wrapper
      )

      document.head.removeChild(style)
    })
  })

  describe('cropping and dimensions: includeOverflow', () => {
    it('expands capture rect for transformed children when overflow is visible', async () => {
      const wrapper = createElement({
        width: '120px',
        height: '120px',
        position: 'relative',
        overflow: 'visible',
        backgroundColor: '#0f172a',
      })

      const child = createElement({
        position: 'absolute',
        left: '10px',
        top: '10px',
        width: '100px',
        height: '100px',
        borderRadius: '9999px',
        backgroundColor: 'rgb(59, 130, 246)', // blue
        transform: 'scale(1.8)',
        transformOrigin: 'center',
      })

      wrapper.appendChild(child)
      container.appendChild(wrapper)

      // Without overflow expansion, this would be clipped to 120x120.
      const canvas = await screenshot.canvas(wrapper, { scale: 2 })

      expect(canvas.width).toBeGreaterThan(120 * 2)
      expect(canvas.height).toBeGreaterThan(120 * 2)

      // Sample a pixel near the right edge of the expanded area. It should be blue-ish.
      const sample = sampleArea(canvas, canvas.width - 10, canvas.height / 2, 3)
      expect(sample.a).toBe(255)
      expect(sample.b).toBeGreaterThan(sample.r)

      await expectCanvasToMatchSnapshot(
        canvas,
        'overflow-expands-capture',
        wrapper
      )
    })

    it('does not clip when an animated scale would grow after capture', async () => {
      const wrapper = document.createElement('div')
      wrapper.style.cssText = `
        width: 120px;
        height: 120px;
        position: relative;
        overflow: visible;
        background: #0f172a;
      `
      const ring = document.createElement('div')
      ring.style.cssText = `
        position: absolute;
        inset: 10px;
        border-radius: 9999px;
        background: rgba(217, 70, 239, 0.35);
      `
      wrapper.appendChild(ring)
      container.appendChild(wrapper)

      // Drive the animation deterministically (avoids runner/browser flakiness with
      // CSS keyframes + negative animation-delay).
      const animation = ring.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.8)' }],
        { duration: 1000, fill: 'both' }
      )
      animation.currentTime = 1000
      animation.pause()
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
      void ring.getBoundingClientRect()

      const canvas = await screenshot.canvas(wrapper, { scale: 2 })

      // At scale(1.8) the ring expands beyond 120x120, so the canvas should be larger.
      expect(canvas.width).toBeGreaterThan(120 * 2)
      expect(canvas.height).toBeGreaterThan(120 * 2)

      await expectCanvasToMatchSnapshot(
        canvas,
        'overflow-animated-scale',
        wrapper
      )
    })
  })
})

describe('snapshot analysis', () => {
  it('renders snapshots at specific animation times', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const wrapper = document.createElement('div')
    wrapper.style.cssText = `
      width: 120px;
      height: 120px;
      position: relative;
      background: transparent;
    `
    const box = document.createElement('div')
    box.style.cssText = `
      width: 80px;
      height: 80px;
      position: absolute;
      inset: 20px;
      background: rgb(16, 185, 129);
    `
    wrapper.appendChild(box)
    container.appendChild(wrapper)

    const animation = box.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 1000,
      fill: 'both',
    })
    animation.pause()
    animation.currentTime = 0
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    )

    const snap = await screenshot.analyze(wrapper)

    const animatedElements = Object.values(snap.elements).filter(
      (el) => el.animations.length > 0
    )
    expect(animatedElements.length).toBeGreaterThan(0)

    const canvasStart = await screenshot.render(snap, { animationTime: 0 })
    const canvasEnd = await screenshot.render(snap, { animationTime: 1000 })

    expect(canvasStart.width).toBeGreaterThan(0)
    expect(canvasEnd.width).toBeGreaterThan(0)

    container.remove()
  })
})
