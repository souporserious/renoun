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

// export const Project = createProject()

// export const Posts = Project.createSource<{
//   frontMatter: {
//     title: string
//     summary: string
//   }
// }>('posts/*.mdx', {
//   baseDirectory: 'posts',
//   basePathname: 'blog',
// })
