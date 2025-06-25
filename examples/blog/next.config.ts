import createMDXPlugin from '@next/mdx'
import rehypeAddCodeBlock from '@renoun/mdx/rehype/add-code-block'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'

const withMDX = createMDXPlugin({
  extension: /\.mdx?$/,
  options: {
    providerImportSource: 'renoun/mdx/components',
    rehypePlugins: [rehypeAddCodeBlock],
    remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter],
  },
})

export default withMDX({
  output: 'export',
  pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
})
