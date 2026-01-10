import { describe, expect, test } from 'vitest'

import { parseFrontmatter } from './parse-frontmatter.js'

describe('parseFrontmatter', () => {
  test.concurrent('returns original content when no frontmatter is present', () => {
    const source = '# Hello world'
    const result = parseFrontmatter(source)

    expect(result.content).toBe(source)
    expect(result.frontmatter).toBeUndefined()
  })

  test.concurrent('parses top-level scalar values', () => {
    const source = `---\ntitle: Hello world\ndescription: Test file\n---\n\n# Hello`
    const result = parseFrontmatter(source)

    expect(result.content).toBe('# Hello')
    expect(result.frontmatter).toEqual({
      title: 'Hello world',
      description: 'Test file',
    })
  })

  test.concurrent('parses arrays and nested objects', () => {
    const source = `---\ntags:\n  - docs\n  - mdx\nauthor:\n  name: Docs Bot\n  links:\n    - label: Website\n      url: https://renoun.dev\n    - label: GitHub\n      url: https://github.com/souporserious/renoun\n---\n\nContent`
    const result = parseFrontmatter(source)

    expect(result.content).toBe('Content')
    expect(result.frontmatter).toEqual({
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

  test.concurrent('parses inline collections and primitive types', () => {
    const source = `---\narray: [one, two, three]\nflags: { featured: true, count: 3 }\n---\nbody`
    const result = parseFrontmatter(source)

    expect(result.content).toBe('body')
    expect(result.frontmatter).toEqual({
      array: ['one', 'two', 'three'],
      flags: { featured: true, count: 3 },
    })
  })

  test.concurrent('returns empty frontmatter for empty block', () => {
    const source = `---\n---\ncontent`
    const result = parseFrontmatter(source)

    expect(result.content).toBe('content')
    expect(result.frontmatter).toEqual({})
  })
})
