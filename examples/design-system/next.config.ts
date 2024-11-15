import createMDXPlugin from '@next/mdx'

const withMDX = createMDXPlugin()

export default withMDX({
  output: 'export',
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  transpilePackages: ['renoun'],
  experimental: {
    mdxRs: true,
  },
})
