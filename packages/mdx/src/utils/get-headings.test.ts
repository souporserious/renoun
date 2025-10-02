import { describe, expect, test, expectTypeOf } from 'vitest'

import type { Headings } from '../remark/add-headings.js'
import { getMarkdownHeadings, getMDXHeadings } from './get-headings.js'

describe('getMarkdownHeadings', () => {
  test('parses markdown headings into id, level and text', () => {
    const source = '# Hello\n\n## World'
    const headings = getMarkdownHeadings(source)

    expect(headings).toEqual([
      { id: 'hello', level: 1, text: 'Hello' },
      { id: 'world', level: 2, text: 'World' },
    ])
    expectTypeOf(headings).toMatchTypeOf<Headings>()
  })

  test('deduplicates duplicate heading ids', () => {
    const source = '# Hello\n# Hello\n# Hello'

    expect(getMarkdownHeadings(source)).toEqual([
      { id: 'hello', level: 1, text: 'Hello' },
      { id: 'hello-2', level: 1, text: 'Hello' },
      { id: 'hello-3', level: 1, text: 'Hello' },
    ])
  })

  test('extracts text from nested inline nodes', () => {
    const source = '# Hello *world* and **friends**'
    const headings = getMarkdownHeadings(source)

    expect(headings).toEqual([
      {
        id: 'hello-world-and-friends',
        level: 1,
        text: 'Hello world and friends',
      },
    ])
  })
})

describe('getMDXHeadings', () => {
  test('parses mdx headings into id, level and text', () => {
    const source = '# Hello, <em>world</em>!\n\n## World'
    const headings = getMDXHeadings(source)

    expect(headings).toEqual([
      { id: 'hello-world', level: 1, text: 'Hello, world!' },
      { id: 'world', level: 2, text: 'World' },
    ])
  })
})
