import { resolve } from 'node:path'
import { filePathToPathname } from './file-path-to-pathname'

const workingDirectory = '/Users/username/Code/renoun/site'

describe('filePathToUrlPathname', () => {
  beforeEach(() => {
    jest.spyOn(process, 'cwd').mockReturnValue(workingDirectory)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('converts a file system path to a URL-friendly pathname', () => {
    expect(
      filePathToPathname(workingDirectory + '/src/components/Code.tsx', 'src')
    ).toBe('/components/code')
  })

  it('removes sorting numbers', () => {
    expect(filePathToPathname('docs/examples/02.authoring.mdx')).toBe(
      '/docs/examples/authoring'
    )
  })

  it('uses package name for index', () => {
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

  it('uses base pathname for index', () => {
    expect(
      filePathToPathname(
        workingDirectory + '/src/index.tsx',
        'src',
        'components'
      )
    ).toBe('/components')
  })

  it('uses base directory for index', () => {
    expect(
      filePathToPathname(
        workingDirectory + '/src/components/index.tsx',
        'components'
      )
    ).toBe('/components')

    expect(filePathToPathname('src/utils/index.js', 'utils')).toBe('/utils')
  })

  it('uses directory for readme', () => {
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

  it('accounts for base directory', () => {
    expect(filePathToPathname('../../src/components/index.tsx', 'src')).toBe(
      '/components'
    )
  })

  it('handles the same directory and base name', () => {
    expect(filePathToPathname('src/components/Button/Button.tsx', 'src')).toBe(
      '/components/button'
    )
  })

  it('normalizes relative paths', () => {
    expect(
      filePathToPathname(
        resolve(workingDirectory, '../packages/renoun/src/components/index.ts'),
        '../packages/renoun/src'
      )
    ).toBe('/components')
  })

  it('handles upper case filenames', () => {
    expect(filePathToPathname('src/components/MDX.tsx', 'src')).toBe(
      '/components/mdx'
    )

    expect(filePathToPathname('src/components/MDXProvider.tsx', 'src')).toBe(
      '/components/mdx-provider'
    )
  })

  it('handles pascal case filenames', () => {
    expect(filePathToPathname('src/components/CodeBlock.tsx', 'src')).toBe(
      '/components/code-block'
    )
  })

  it('handles camel case filenames', () => {
    expect(filePathToPathname('src/hooks/useHover.ts', 'src')).toBe(
      '/hooks/use-hover'
    )
  })

  it('handles nested paths with the same name as base directory', () => {
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

  it('replaces base directory with base pathname', () => {
    expect(
      filePathToPathname('/src/posts/getting-started.mdx', 'posts', 'blog')
    ).toBe('/blog/getting-started')
  })

  it('removes working directory', () => {
    expect(filePathToPathname(workingDirectory + '/src/hooks/index.tsx')).toBe(
      '/src/hooks'
    )
  })

  it('handles base directory, base pathname, and package name', () => {
    expect(
      filePathToPathname(
        resolve(workingDirectory, '../packages/renoun/src/index.ts'),
        '../packages/renoun/src',
        'packages',
        'renoun'
      )
    ).toBe('/packages/renoun')
  })

  it('file name member', () => {
    expect(filePathToPathname('src/components/Button.tests.tsx', 'src')).toBe(
      '/components/button/tests'
    )
  })

  it('directory, file name, and file name member', () => {
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
