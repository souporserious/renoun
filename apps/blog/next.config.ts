import createMDXPlugin from '@next/mdx'

const withMDX = createMDXPlugin({
  extension: /\.mdx?$/,
  options: {
    providerImportSource: 'renoun/mdx/components',
    rehypePlugins: ['@renoun/mdx/rehype/add-code-block'],
    remarkPlugins: ['remark-frontmatter', 'remark-mdx-frontmatter'],
  },
})

export default withMDX({
  output: 'export',
  pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
})
