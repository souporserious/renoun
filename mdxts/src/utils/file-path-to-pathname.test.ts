import { filePathToPathname } from './file-path-to-pathname'

describe('filePathToUrlPathname', () => {
  beforeEach(() => {
    jest.spyOn(process, 'cwd').mockReturnValue('/Users/mdxts')
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('converts a file system path to a URL-friendly pathname', () => {
    expect(filePathToPathname('/mdxts/src/components/Code.tsx', 'src')).toBe(
      'components/code'
    )
  })

  it('removes sorting numbers', () => {
    expect(filePathToPathname('docs/examples/02.authoring.mdx')).toBe(
      'docs/examples/authoring'
    )
  })

  it('uses directory for index and readme', () => {
    expect(
      filePathToPathname('/Users/mdxts/src/components/index.tsx', 'src')
    ).toBe('components')

    expect(filePathToPathname('mdxts/src/components/README.mdx')).toBe(
      'mdxts/src/components'
    )
  })

  it('accounts for base directory', () => {
    expect(filePathToPathname('../../src/components/index.tsx', 'src')).toBe(
      'components'
    )
  })
})
