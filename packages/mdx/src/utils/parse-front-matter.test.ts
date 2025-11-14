import { describe, expect, test } from 'vitest'

import { parseFrontMatter } from './parse-front-matter.js'

describe('parseFrontMatter', () => {
  test('returns original content when no front matter is present', () => {
    const source = '# Hello world'
    const result = parseFrontMatter(source)

    expect(result.content).toBe(source)
    expect(result.frontMatter).toBeUndefined()
  })

  test('parses top-level scalar values', () => {
    const source = `---\ntitle: Hello world\ndescription: Test file\n---\n\n# Hello`
    const result = parseFrontMatter(source)

    expect(result.content).toBe('# Hello')
    expect(result.frontMatter).toEqual({
      title: 'Hello world',
      description: 'Test file',
    })
  })

  test('parses arrays and nested objects', () => {
    const source = `---\ntags:\n  - docs\n  - mdx\nauthor:\n  name: Docs Bot\n  links:\n    - label: Website\n      url: https://renoun.dev\n    - label: GitHub\n      url: https://github.com/souporserious/renoun\n---\n\nContent`
    const result = parseFrontMatter(source)

    expect(result.content).toBe('Content')
    expect(result.frontMatter).toEqual({
      tags: ['docs', 'mdx'],
      author: {
        name: 'Docs Bot',
        links: [
          { label: 'Website', url: 'https://renoun.dev' },
          {
            label: 'GitHub',
            url: 'https://github.com/souporserious/renoun',
          },
        ],
      },
    })
  })

  test('parses inline collections and primitive types', () => {
    const source = `---\narray: [one, two, three]\nflags: { featured: true, count: 3 }\n---\nbody`
    const result = parseFrontMatter(source)

    expect(result.content).toBe('body')
    expect(result.frontMatter).toEqual({
      array: ['one', 'two', 'three'],
      flags: { featured: true, count: 3 },
    })
  })

  test('returns empty front matter for empty block', () => {
    const source = `---\n---\ncontent`
    const result = parseFrontMatter(source)

    expect(result.content).toBe('content')
    expect(result.frontMatter).toEqual({})
  })
})
