import { beforeEach, afterEach, describe, test, expect, vi } from 'vitest'
import { join } from 'node:path'

import { filePathToPathname } from './file-path-to-pathname.js'

const workingDirectory = '/Users/username/Code/renoun/site'

describe('filePathToPathname', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(workingDirectory)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('converts a file system path to a URL-friendly pathname', () => {
    expect(
      filePathToPathname(
        join(workingDirectory, 'src/components/Code.tsx'),
        join(workingDirectory, 'src')
      )
    ).toBe('/components/code')
  })

  test('removes sorting numbers', () => {
    expect(
      filePathToPathname(
        join(workingDirectory, 'docs/examples/02.authoring.mdx'),
        workingDirectory
      )
    ).toBe('/docs/examples/authoring')
  })

  test('directory index', () => {
    expect(
      filePathToPathname('src/collections/index.tsx', 'src/collections')
    ).toBe('/index')
  })

  test('uses base pathname', () => {
    expect(filePathToPathname('src/index.tsx', 'src', 'components')).toBe(
      '/components/index'
    )
  })

  test('trims base directory', () => {
    expect(filePathToPathname('src/components/index.tsx', 'src')).toBe(
      '/components/index'
    )

    expect(filePathToPathname('src/utils/index.js', 'src')).toBe('/utils/index')
  })

  test('accounts for base directory', () => {
    expect(
      filePathToPathname('../../src/components/index.tsx', '../../src')
    ).toBe('/components/index')
  })

  test('errors for bad base directory', () => {
    expect(() => {
      filePathToPathname('src/components/index.ts', 'src/utils')
    }).toThrowError()
  })

  test('handles the same directory and base name', () => {
    expect(filePathToPathname('src/components/Button/Button.tsx', 'src')).toBe(
      '/components/button'
    )
  })

  test('normalizes relative paths', () => {
    expect(
      filePathToPathname(
        join(workingDirectory, '../packages/renoun/src/components/index.ts'),
        join(workingDirectory, '../packages/renoun/src')
      )
    ).toBe('/components/index')
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
      filePathToPathname('/src/posts/getting-started.mdx', '/src/posts', 'blog')
    ).toBe('/blog/getting-started')
  })

  test('removes working directory', () => {
    expect(filePathToPathname('/src/hooks/index.tsx')).toBe('/src/hooks/index')
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
