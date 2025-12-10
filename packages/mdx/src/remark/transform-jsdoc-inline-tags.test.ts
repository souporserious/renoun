import { describe, expect, test } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import type { Paragraph, Root } from 'mdast'

import transformJSDocInlineTags from './transform-jsdoc-inline-tags'

function transform(value: string) {
  const processor = unified().use(remarkParse).use(transformJSDocInlineTags)
  const tree = processor.parse(value)
  return processor.runSync(tree) as Root
}

describe('transformJSDocInlineTags', () => {
  test('converts jsdoc links with default labels', () => {
    const tree = transform('See {@link Foo} for more info.')
    const paragraph = tree.children[0] as Paragraph

    expect(paragraph.children).toEqual([
      { type: 'text', value: 'See ' },
      {
        type: 'link',
        url: 'Foo',
        title: null,
        children: [{ type: 'text', value: 'Foo' }],
      },
      { type: 'text', value: ' for more info.' },
    ])
  })

  test('supports fragments and custom labels', () => {
    const tree = transform(
      'Refer to {@link Foo#bar|the bar member} or {@link Baz#qux}.'
    )
    const paragraph = tree.children[0] as Paragraph

    expect(paragraph.children).toEqual([
      { type: 'text', value: 'Refer to ' },
      {
        type: 'link',
        url: 'Foo#bar',
        title: null,
        children: [{ type: 'text', value: 'the bar member' }],
      },
      { type: 'text', value: ' or ' },
      {
        type: 'link',
        url: 'Baz#qux',
        title: null,
        children: [{ type: 'text', value: 'Baz#qux' }],
      },
      { type: 'text', value: '.' },
    ])
  })

  test('handles multiple links inside a single text node', () => {
    const tree = transform('{@link Foo}|{@link Bar|bar}|{@link Baz}')
    const paragraph = tree.children[0] as Paragraph

    expect(paragraph.children).toEqual([
      {
        type: 'link',
        url: 'Foo',
        title: null,
        children: [{ type: 'text', value: 'Foo' }],
      },
      { type: 'text', value: '|' },
      {
        type: 'link',
        url: 'Bar',
        title: null,
        children: [{ type: 'text', value: 'bar' }],
      },
      { type: 'text', value: '|' },
      {
        type: 'link',
        url: 'Baz',
        title: null,
        children: [{ type: 'text', value: 'Baz' }],
      },
    ])
  })

  test('supports link variants and tutorial references', () => {
    const tree = transform(
      'See {@linkplain Foo} and {@linkcode bar.baz|call()}; tutorial: {@tutorial intro#setup}.'
    )
    const paragraph = tree.children[0] as Paragraph

    expect(paragraph.children).toEqual([
      { type: 'text', value: 'See ' },
      {
        type: 'link',
        url: 'Foo',
        title: null,
        children: [{ type: 'text', value: 'Foo' }],
      },
      { type: 'text', value: ' and ' },
      {
        type: 'link',
        url: 'bar.baz',
        title: null,
        children: [{ type: 'inlineCode', value: 'call()' }],
      },
      { type: 'text', value: '; tutorial: ' },
      {
        type: 'link',
        url: 'intro#setup',
        title: null,
        children: [{ type: 'text', value: 'intro#setup' }],
      },
      { type: 'text', value: '.' },
    ])
  })

  test('converts code and literal inline tags', () => {
    const tree = transform(
      'Return {@code value} and keep {@literal <b>raw</b>} markup.'
    )
    const paragraph = tree.children[0] as Paragraph

    expect(paragraph.children).toEqual([
      { type: 'text', value: 'Return ' },
      { type: 'inlineCode', value: 'value' },
      { type: 'text', value: ' and keep ' },
      { type: 'text', value: '<b>raw</b>' },
      { type: 'text', value: ' markup.' },
    ])
  })
})
