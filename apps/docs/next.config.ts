import createMDXPlugin from '@next/mdx'

const withMDX = createMDXPlugin({
  options: {
    rehypePlugins: [
      '@renoun/mdx/rehype/add-code-block',
      '@renoun/mdx/rehype/add-reading-time',
    ],
    remarkPlugins: [
      '@renoun/mdx/remark/add-sections',
      '@renoun/mdx/remark/transform-relative-links',
    ],
  },
})

export default withMDX({
  output: 'export',
  pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
})
