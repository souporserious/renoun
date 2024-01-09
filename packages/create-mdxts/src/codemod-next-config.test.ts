import { Project } from 'ts-morph'
import {
  codemodNextJsConfig,
  codemodNextMjsConfig,
} from './codemod-next-config'

describe('codemodNextConfig', () => {
  it('should correctly modify the next.config.js file', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const sourceFile = project.createSourceFile(
      'next.config.js',
      `module.exports = { reactStrictMode: true, pageExtensions: ['mdx', 'tsx'] }`
    )

    codemodNextJsConfig(sourceFile)

    const modifiedContent = sourceFile.getFullText()
    expect(modifiedContent).toContain(
      "const { createMdxtsPlugin } = require('mdxts/next');"
    )
    expect(modifiedContent).toContain(
      "module.exports = withMdxts({ reactStrictMode: true, pageExtensions: ['mdx', 'tsx'] })"
    )
  })

  it('should correctly modify the next.config.mjs file', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { allowJs: true },
    })
    const sourceFile = project.createSourceFile(
      'next.config.mjs',
      `export default { reactStrictMode: true, pageExtensions: ['mdx', 'tsx'] }`
    )

    codemodNextMjsConfig(sourceFile)

    const modifiedContent = sourceFile.getFullText()
    expect(modifiedContent).toContain(
      "import { createMdxtsPlugin } from 'mdxts/next';"
    )
    expect(modifiedContent).toContain(
      "export default withMdxts({ reactStrictMode: true, pageExtensions: ['mdx', 'tsx'] })"
    )
  })
})
