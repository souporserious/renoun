import { createDataSource } from 'mdxts'

export const allDocs = createDataSource('docs/**/*.mdx', {
  baseDirectory: 'docs',
})

export const allComponents = createDataSource('../mdxts/src/components/*.tsx', {
  baseDirectory: '../mdxts/src',
})

export const allPackages = createDataSource('../mdxts/src/**/*.(ts|tsx)', {
  baseDirectory: '../mdxts/src',
  basePath: 'packages',
})
