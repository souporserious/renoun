import { createDataSource, mergeDataSources } from 'mdxts'

export const allComponents = createDataSource('../mdxts/src/components/*.tsx', {
  baseDirectory: '../mdxts/src',
})

export const allDocs = createDataSource('docs/**/*.mdx', {
  baseDirectory: 'docs',
  basePathname: 'docs',
})

export const allPackages = createDataSource('../mdxts/src/**/*.(ts|tsx)', {
  baseDirectory: '../mdxts/src',
  basePathname: 'packages',
})

export const allData = mergeDataSources(allDocs, allPackages)
