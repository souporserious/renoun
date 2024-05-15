import { createSource, mergeSources } from 'mdxts'

export const allDocs = createSource('docs/**/*.mdx')

export const allPackages = createSource('../packages/mdxts/src/**/*.{ts,tsx}', {
  baseDirectory: '../packages/mdxts/src',
  basePathname: 'packages',
  outputDirectory: ['dist/src', 'dist/cjs'],
})

export const allPosts = createSource<{
  frontMatter: {
    title: string
    summary: string
    author: string
  }
}>('posts/*.mdx', {
  baseDirectory: 'posts',
  basePathname: 'blog',
})

export const allData = mergeSources(allDocs, allPackages)
