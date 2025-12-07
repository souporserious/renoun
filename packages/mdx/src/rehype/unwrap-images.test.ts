import { describe, expect, it } from 'vitest'
import type { Root } from 'hast'
import { unified } from 'unified'
import rehypeParse from 'rehype-parse'

import rehypeUnwrapImages from './unwrap-images.js'

function run(html: string): Root {
  const processor = unified().use(rehypeParse, { fragment: true })
  processor.use(rehypeUnwrapImages)
  const tree = processor.parse(html) as Root
  return processor.runSync(tree) as Root
}

describe('rehype/unwrap-images', () => {
  it('unwraps paragraphs that only contain an image', () => {
    const tree = run('<p><img src="/a.jpg" alt="" /></p>')

    expect(tree.children).toHaveLength(1)
    const image = tree.children[0]
    if (image.type !== 'element') throw new Error('expected element')
    expect(image.tagName).toBe('img')
  })

  it('keeps links around image content intact', () => {
    const tree = run('<p><a href="#"><img src="/a.jpg" alt="" /></a></p>')

    const link = tree.children[0]
    if (link.type !== 'element') throw new Error('expected element')
    expect(link.tagName).toBe('a')
    const image = link.children[0]
    if (image.type !== 'element') throw new Error('expected element')
    expect(image.tagName).toBe('img')
  })

  it('ignores paragraphs that contain other content', () => {
    const tree = run('<p>Intro <img src="/a.jpg" alt="" /></p>')

    const paragraph = tree.children[0]
    if (paragraph.type !== 'element') throw new Error('expected element')
    expect(paragraph.tagName).toBe('p')
    expect(paragraph.children.some((child) => child.type === 'element')).toBe(
      true
    )
  })
})
