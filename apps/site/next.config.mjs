import createMDXPlugin from '@next/mdx'

const withMDX = createMDXPlugin({
  extension: /\.mdx?$/,
  options: {
    rehypePlugins: [
      '@renoun/mdx/rehype/add-code-block',
      '@renoun/mdx/rehype/add-reading-time',
      '@renoun/mdx/rehype/unwrap-images',
    ],
    remarkPlugins: [
      '@renoun/mdx/remark/add-sections',
      '@renoun/mdx/remark/gfm',
      '@renoun/mdx/remark/remove-immediate-paragraphs',
      '@renoun/mdx/remark/transform-relative-links',
      '@renoun/mdx/remark/typography',
    ],
    jsxImportSource: 'restyle',
  },
})

export default withMDX({
  images: { unoptimized: true },
  output: 'export',
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  transpilePackages: ['renoun'],
})
