import { createDataSource, mergeDataSources } from 'mdxts'

export const allDocs = createDataSource('docs/**/*.mdx')

export const allPackages = createDataSource('../mdxts/src/**/*.(ts|tsx)', {
  baseDirectory: '../mdxts/src',
  basePathname: 'packages',
})

export const allData = mergeDataSources(allDocs, allPackages)
