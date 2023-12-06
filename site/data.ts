import { createSourceFiles } from 'mdxts'

export const allDocs = createSourceFiles('docs/**/*.mdx', {
  baseDirectory: 'docs',
})

export const allComponents = createSourceFiles(
  '../mdxts/src/components/*.tsx',
  { baseDirectory: '../mdxts/src' }
)
