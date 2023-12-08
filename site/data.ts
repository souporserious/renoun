import { createDataSource } from 'mdxts'

export const allDocs = createDataSource('docs/**/*.mdx', {
  baseDirectory: 'docs',
})

export const allComponents = createDataSource('../mdxts/src/components/*.tsx', {
  baseDirectory: '../mdxts/src/components',
  basePath: 'components',
})
