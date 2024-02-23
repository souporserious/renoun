import { Project } from 'ts-morph'
import {
  codemodNextJsConfig,
  codemodNextMjsConfig,
} from './codemod-next-config'

describe('codemodNextConfig', () => {
  it('modifies js object literal config', () => {
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

  it('modifies js function config', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const sourceFile = project.createSourceFile(
      'next.config.js',
      `module.exports = function() {\nreturn { reactStrictMode: true, pageExtensions: ['mdx', 'tsx'] }\n}`
    )

    codemodNextJsConfig(sourceFile)

    const modifiedContent = sourceFile.getFullText()
    expect(modifiedContent).toContain(
      `withMdxts({ reactStrictMode: true, pageExtensions: ['mdx', 'tsx'] });`
    )
  })

  it('modifies mjs object literal config', () => {
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

  it('modifies mjs function config', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { allowJs: true },
    })
    const sourceFile = project.createSourceFile(
      'next.config.mjs',
      `export default function() {\nreturn { reactStrictMode: true, pageExtensions: ['mdx', 'tsx'] }\n}`
    )

    codemodNextMjsConfig(sourceFile)

    const modifiedContent = sourceFile.getFullText()
    expect(modifiedContent).toContain(
      `return withMdxts({ reactStrictMode: true, pageExtensions: ['mdx', 'tsx'] });`
    )
  })
})
