import createMDXPlugin from '@next/mdx'

const withMDX = createMDXPlugin({
  extension: /\.mdx?$/,
})

export default withMDX({
  output: 'export',
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  transpilePackages: ['renoun'],
})
