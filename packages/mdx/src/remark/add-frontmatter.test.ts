import { describe, expect, test } from 'vitest'
import { evaluate } from '@mdx-js/mdx'
import * as jsxRuntime from 'react/jsx-runtime'
import * as jsxDevRuntime from 'react/jsx-dev-runtime'

import addFrontmatter from './add-frontmatter'

const runtime = {
  ...jsxRuntime,
  ...jsxDevRuntime,
}

describe('addFrontmatter', () => {
  test.concurrent('exports parsed frontmatter', async () => {
    const source =
      `---\n` +
      `title: Hello, world!\n` +
      `nested:\n` +
      `  value: 123\n` +
      `list:\n` +
      `  - alpha\n` +
      `  - beta\n` +
      `---\n\n` +
      `# Hello\n`

    const { frontmatter } = await evaluate(source, {
      remarkPlugins: [addFrontmatter],
      development: true,
      ...runtime,
    })

    expect(frontmatter).toEqual({
      title: 'Hello, world!',
      nested: { value: 123 },
      list: ['alpha', 'beta'],
    })
  })

  test.concurrent('keeps author-defined frontmatter export', async () => {
    const source =
      `---\n` +
      `title: Generated\n` +
      `---\n\n` +
      `export const frontmatter = { title: 'Custom' }\n\n` +
      `# Hello\n`

    const { frontmatter } = await evaluate(source, {
      remarkPlugins: [addFrontmatter],
      development: true,
      ...runtime,
    })

    expect(frontmatter).toEqual({ title: 'Custom' })
  })

  test.concurrent('ignores documents without frontmatter', async () => {
    const { frontmatter } = await evaluate('# Hello', {
      remarkPlugins: [addFrontmatter],
      development: true,
      ...runtime,
    })

    expect(frontmatter).toBeUndefined()
  })
})
