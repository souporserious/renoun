import createMDXPlugin from '@next/mdx'

const withMDX = createMDXPlugin()

export default withMDX({
  output: 'export',
  pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
  experimental: { mdxRs: true },
})
