import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import rehypeParse from 'rehype-parse'
import { VFile } from 'vfile'

import addReadingTime, {
  type InferReadingTimeOptions,
} from './add-reading-time'

function run(html: string, options?: InferReadingTimeOptions) {
  const file = new VFile({ value: html, path: 'test.html' })
  const processor = unified().use(rehypeParse, { fragment: true })
  processor.use(addReadingTime, options)
  const tree = processor.parse(file)
  processor.runSync(tree, file)
  return file
}

describe('rehype/add-reading-time', () => {
  it('exports formatted string by default', () => {
    const file = run('<p>Hello world this is a short test.</p>')
    const meta = file.data as any
    expect(typeof meta.meta.readingTime).toBe('string')
    expect(meta.meta.readingTime).toMatch(/^[0-9]+(\.[0-9])?$/)
  })

  it('exports raw number when format=false', () => {
    const file = run(
      '<p>One two three four five six seven eight nine ten.</p>',
      { format: false }
    )
    const meta = file.data as any
    expect(typeof meta.meta.readingTime).toBe('number')
  })

  it('applies rounding and digits', () => {
    const html = '<p>' + 'word '.repeat(300) + '</p>'
    const file = run(html, {
      rounding: 'nearest',
      digits: 1,
      format: false,
    })
    const meta = file.data as any
    expect(typeof meta.meta.readingTime).toBe('number')
    // should be a one-decimal-place number
    const value = meta.meta.readingTime as number
    expect(Number.isFinite(value)).toBe(true)
    expect(Math.round(value * 10) / 10).toBeCloseTo(value, 5)
  })

  it('counts images (default) and alt text/figcaption', () => {
    const html =
      '<figure><img alt="Alt text"/><figcaption>Caption text</figcaption></figure>'
    const fileA = run(html, { format: false })
    const fileB = run(html, { countImages: false, format: false })
    const a = (fileA.data as any).meta.readingTime as number
    const b = (fileB.data as any).meta.readingTime as number
    expect(a).toBeGreaterThanOrEqual(b)
  })

  it('includeCode=false excludes code contribution', () => {
    const html = '<pre><code>' + 'code '.repeat(300) + '</code></pre>'
    const fileSkip = run(html, { includeCode: false, format: false })
    const fileSlow = run(html, { includeCode: 'slow', format: false })
    const a = (fileSkip.data as any).meta.readingTime as number
    const b = (fileSlow.data as any).meta.readingTime as number
    expect(a).toBeLessThanOrEqual(b)
  })
})
