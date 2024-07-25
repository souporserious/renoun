import { createSource, mergeSources } from 'mdxts'

export const allDocs = createSource('docs/**/*.mdx')

export const allPackages = createSource('../packages/mdxts/src/**/*.{ts,tsx}', {
  baseDirectory: '../packages/mdxts/src',
  basePathname: 'packages',
  outputDirectory: ['dist/esm', 'dist/src'],
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

// import { createCollection, type MDXContent } from 'mdxts'

// export const allDocs = createCollection('docs/**/*.mdx')

// export const allPosts = createCollection<{
//   default: MDXContent,
//   frontMatter: {
//     title: string
//     summary: string
//     author: string
//   }
// }>('posts/*.mdx', {
//   baseDirectory: 'posts',
//   basePathname: 'blog',
// })

// export const allPackages = createCollection('src/**/*.{ts,tsx}', {
//   baseDirectory: 'src',
//   basePathname: 'packages',
//   tsConfigFilePath: '../packages/mdxts/tsconfig.json',
// })
