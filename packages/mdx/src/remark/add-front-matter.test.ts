import { describe, expect, test } from 'vitest'
import { evaluate } from '@mdx-js/mdx'
import * as jsxRuntime from 'react/jsx-runtime'
import * as jsxDevRuntime from 'react/jsx-dev-runtime'

import addFrontMatter from './add-front-matter'

const runtime = {
  ...jsxRuntime,
  ...jsxDevRuntime,
}

describe('addFrontMatter', () => {
  test('exports parsed front matter', async () => {
    const source = `---\n` +
      `title: Hello, world!\n` +
      `nested:\n` +
      `  value: 123\n` +
      `list:\n` +
      `  - alpha\n` +
      `  - beta\n` +
      `---\n\n` +
      `# Hello\n`

    const { frontMatter } = await evaluate(source, {
      remarkPlugins: [addFrontMatter],
      development: true,
      ...runtime,
    })

    expect(frontMatter).toEqual({
      title: 'Hello, world!',
      nested: { value: 123 },
      list: ['alpha', 'beta'],
    })
  })

  test('keeps author-defined frontMatter export', async () => {
    const source = `---\n` +
      `title: Generated\n` +
      `---\n\n` +
      `export const frontMatter = { title: 'Custom' }\n\n` +
      `# Hello\n`

    const { frontMatter } = await evaluate(source, {
      remarkPlugins: [addFrontMatter],
      development: true,
      ...runtime,
    })

    expect(frontMatter).toEqual({ title: 'Custom' })
  })

  test('ignores documents without front matter', async () => {
    const { frontMatter } = await evaluate('# Hello', {
      remarkPlugins: [addFrontMatter],
      development: true,
      ...runtime,
    })

    expect(frontMatter).toBeUndefined()
  })
})
