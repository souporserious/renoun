import { beforeEach, afterEach, describe, test, expect, vi } from 'vitest'
import { resolve } from 'node:path'

import { filePathToPathname } from './file-path-to-pathname.js'

const workingDirectory = '/Users/username/Code/renoun/site'

describe('filePathToUrlPathname', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(workingDirectory)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('converts a file system path to a URL-friendly pathname', () => {
    expect(
      filePathToPathname(workingDirectory + '/src/components/Code.tsx', 'src')
    ).toBe('/components/code')
  })

  test('removes sorting numbers', () => {
    expect(filePathToPathname('docs/examples/02.authoring.mdx')).toBe(
      '/docs/examples/authoring'
    )
  })

  test('uses package name for index', () => {
    expect(
      filePathToPathname(
        workingDirectory + '/src/index.ts',
        'src',
        undefined,
        'renoun'
      )
    ).toBe('/renoun')

    expect(filePathToPathname('src/utils/index.js', 'utils')).toBe('/utils')
  })

  test('uses base pathname for index', () => {
    expect(
      filePathToPathname(
        workingDirectory + '/src/index.tsx',
        'src',
        'components'
      )
    ).toBe('/components')
  })

  test('uses base directory for index', () => {
    expect(
      filePathToPathname(
        workingDirectory + '/src/components/index.tsx',
        'components'
      )
    ).toBe('/components')

    expect(filePathToPathname('src/utils/index.js', 'utils')).toBe('/utils')
  })

  test('uses directory for readme', () => {
    expect(filePathToPathname('renoun/src/components/readme.md')).toBe(
      '/renoun/src/components'
    )

    expect(
      filePathToPathname(
        workingDirectory + '/src/README.mdx',
        'src',
        'packages'
      )
    ).toBe('/packages')
  })

  test('accounts for base directory', () => {
    expect(filePathToPathname('../../src/components/index.tsx', 'src')).toBe(
      '/components'
    )
  })

  test('handles the same directory and base name', () => {
    expect(filePathToPathname('src/components/Button/Button.tsx', 'src')).toBe(
      '/components/button'
    )
  })

  test('normalizes relative paths', () => {
    expect(
      filePathToPathname(
        resolve(workingDirectory, '../packages/renoun/src/components/index.ts'),
        '../packages/renoun/src'
      )
    ).toBe('/components')
  })

  test('handles upper case filenames', () => {
    expect(filePathToPathname('src/components/MDX.tsx', 'src')).toBe(
      '/components/mdx'
    )

    expect(filePathToPathname('src/components/MDXProvider.tsx', 'src')).toBe(
      '/components/mdx-provider'
    )
  })

  test('handles pascal case filenames', () => {
    expect(filePathToPathname('src/components/CodeBlock.tsx', 'src')).toBe(
      '/components/code-block'
    )
  })

  test('handles camel case filenames', () => {
    expect(filePathToPathname('src/hooks/useHover.ts', 'src')).toBe(
      '/hooks/use-hover'
    )
  })

  test('handles nested paths with the same name as base directory', () => {
    expect(
      filePathToPathname(
        'content/content_1/section_1/01.page-1.mdx',
        'content/'
      )
    ).toBe('/content-1/section-1/page-1')

    expect(
      filePathToPathname('content/content_1/section_1/01.page-1.mdx', 'content')
    ).toBe('/content-1/section-1/page-1')

    expect(
      filePathToPathname(
        '/src/content/content_1/section_1/01.page-1.mdx',
        '/src/content'
      )
    ).toBe('/content-1/section-1/page-1')
  })

  test('replaces base directory with base pathname', () => {
    expect(
      filePathToPathname('/src/posts/getting-started.mdx', 'posts', 'blog')
    ).toBe('/blog/getting-started')
  })

  test('removes working directory', () => {
    expect(filePathToPathname(workingDirectory + '/src/hooks/index.tsx')).toBe(
      '/src/hooks'
    )
  })

  test('handles base directory, base pathname, and package name', () => {
    expect(
      filePathToPathname(
        resolve(workingDirectory, '../packages/renoun/src/index.ts'),
        '../packages/renoun/src',
        'packages',
        'renoun'
      )
    ).toBe('/packages/renoun')
  })

  test('file name member', () => {
    expect(filePathToPathname('src/components/Button.tests.tsx', 'src')).toBe(
      '/components/button/tests'
    )
  })

  test('directory, file name, and file name member', () => {
    expect(
      filePathToPathname('src/components/Button/Button/examples', 'src')
    ).toBe('/components/button/examples')

    expect(
      filePathToPathname('src/components/Button/examples.tsx', 'src')
    ).toBe('/components/button/examples')

    expect(
      filePathToPathname('src/components/Button/Button.examples.tsx', 'src')
    ).toBe('/components/button/examples')
  })
})
