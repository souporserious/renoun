import { Project } from 'ts-morph'
import { getExportedTypes } from './get-exported-types'

describe('getExportedTypes', () => {
  const project = new Project()

  it('gets exported types from source file', () => {
    const sourceFile = project.createSourceFile(
      'src/MDXComponents.ts',
      `export const MDXComponents = {}\n\nexport function useMDXComponents() {}`,
      { overwrite: true }
    )
    const types = getExportedTypes(sourceFile)

    expect(types).toMatchInlineSnapshot(`
[
  {
    "description": null,
    "filePath": "/Users/souporserious/Code/mdxts/packages/mdxts/src/MDXComponents.ts",
    "isComponent": false,
    "name": "useMDXComponents",
    "slug": "use-mdx-components",
    "types": [],
  },
]
`)
  })

  it('gets exported types from index source file', () => {
    project.createSourceFile(
      'src/MDXComponents.ts',
      `export const MDXComponents = {}\n\nexport function useMDXComponents() {}`,
      { overwrite: true }
    )
    const sourceFile = project.createSourceFile(
      'src/index.ts',
      `export { MDXComponents } from './MDXComponents'`,
      { overwrite: true }
    )
    const types = getExportedTypes(sourceFile)

    expect(types).toMatchInlineSnapshot(`
[
  [
    {
      "description": null,
      "filePath": "/Users/souporserious/Code/mdxts/packages/mdxts/src/MDXComponents.ts",
      "isComponent": false,
      "name": "useMDXComponents",
      "slug": "use-mdx-components",
      "types": [],
    },
  ],
]
`)
  })
})
