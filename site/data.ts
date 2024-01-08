import { createSource, mergeSources } from 'mdxts'

export const allDocs = createSource('docs/**/*.mdx')

export const allPackages = createSource('../packages/mdxts/src/**/*.(ts|tsx)', {
  baseDirectory: '../packages/mdxts/src',
  basePathname: 'packages',
})

export const allData = mergeSources(allDocs, allPackages)
