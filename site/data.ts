import { createSource, mergeSources } from 'mdxts'

export const allDocs = createSource('docs/**/*.mdx')

export const allPackages = createSource('../mdxts/src/**/*.(ts|tsx)', {
  baseDirectory: '../mdxts/src',
  basePathname: 'packages',
})

export const allData = mergeSources(allDocs, allPackages)
